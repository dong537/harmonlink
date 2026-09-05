import { Injectable, NestMiddleware } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import * as crypto from 'crypto';
import { prisma } from '@ipeasy/db';
import { ErrorCode } from '../errors/error-codes';
import { AppError } from '../errors/app-error';
import { requestIdStorage } from '../logging/request-id.context';
import { SitesRepository } from '../../modules/sites/sites.repository';

/**
 * Paths that must stay reachable while a site is in maintenance, otherwise an
 * operator cannot log in and turn maintenance back off:
 *   - /health, /ready              deployment probes
 *   - /api/auth/login              obtain the admin token
 *   - /api/sites/current           branding for the maintenance page
 *
 * These are matched against the ORIGINAL request path. Nest rewrites `req.url`
 * to '/' for middleware registered with forRoutes('*'), so matching on
 * `req.url` silently bypasses nothing at all.
 */
const BYPASS_PATHS = ['/health', '/ready', '/api/auth/login', '/api/sites/current'];

type RawRequestWithOriginalUrl = FastifyRequest['raw'] & {
  originalUrl?: string;
};

@Injectable()
export class MaintenanceMiddleware implements NestMiddleware {
  constructor(private readonly sites: SitesRepository) {}

  async use(req: FastifyRequest['raw'], res: FastifyReply['raw'], next: () => void): Promise<void> {
    const path = requestPath(req);

    if (isBypassPath(path, req.method ?? 'GET')) {
      return next();
    }

    const site = await this.resolveSite(req);
    if (!site?.maintenanceMode) {
      return next();
    }

    // Middleware runs before AuthGuard, so `req.authContext` does not exist yet.
    // Resolve the caller's privilege from the same bearer session the JWT
    // strategy reads, so a platform admin can still reach the toggle. An absent,
    // malformed, expired, or non-admin credential simply is not a bypass.
    if (await isPlatformAdminRequest(req, site.id)) {
      return next();
    }

    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      code: ErrorCode.UPSTREAM_DISABLED,
      msg: site.maintenanceMessage ?? 'Service is under maintenance',
      data: { reasonKey: 'site_maintenance' },
      requestId: requestIdStorage.getStore() ?? '',
    }));
  }

  /**
   * Resolves the requested site through the same seam public traffic uses
   * (`x-public-host` first, then `Host`, including reseller custom domains and
   * the oldest-ACTIVE-site fallback), so the maintenance gate and the public
   * site context cannot disagree about which site the caller is on.
   */
  private async resolveSite(
    req: FastifyRequest['raw'],
  ): Promise<{ id: string; maintenanceMode: boolean; maintenanceMessage: string | null } | null> {
    const host = firstHeaderValue(req.headers['x-public-host']) ?? firstHeaderValue(req.headers['host']);
    let siteId: string;
    try {
      ({ siteId } = await this.sites.resolvePublicContext(host));
    } catch (error) {
      // No site exists at all (site_not_found). There is nothing to gate.
      if (error instanceof AppError && error.code === ErrorCode.NOT_FOUND) return null;
      throw error;
    }
    return prisma.sites.findUnique({
      where: { id: siteId },
      select: { id: true, maintenanceMode: true, maintenanceMessage: true },
    });
  }
}

function requestPath(req: FastifyRequest['raw']): string {
  const url = (req as RawRequestWithOriginalUrl).originalUrl ?? req.url ?? '';
  return url.split('?')[0] ?? '';
}

function firstHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function isBypassPath(path: string, method: string): boolean {
  if (BYPASS_PATHS.some((p) => path === p || path.startsWith(p + '/'))) return true;
  return method === 'GET' && /^\/api\/tenants\/[^/]+\/brand$/.test(path);
}

/**
 * True only for a live, unrevoked admin session on this site that JwtStrategy
 * would resolve to ownerType PLATFORM_ADMIN — which is what PlatformAdminGuard
 * requires to reach PUT /api/sites/current/maintenance. OPERATOR resolves to
 * its own ownerType and cannot reach that toggle, so it gets no bypass here;
 * granting one would admit an operator the toggle itself would then reject.
 *
 * It deliberately does not throw: a missing, malformed, expired, or non-admin
 * credential means "no bypass", not "reject the request" — the 503 is the answer.
 */
async function isPlatformAdminRequest(req: FastifyRequest['raw'], siteId: string): Promise<boolean> {
  const authorization = firstHeaderValue(req.headers['authorization']);
  if (!authorization?.startsWith('Bearer ')) return false;

  const token = authorization.slice(7);
  if (!token || token.startsWith('rt_')) return false;

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const session = await prisma.sessions.findUnique({
    where: { token: tokenHash },
    select: { ownerId: true, ownerType: true, siteId: true, revokedAt: true, expiresAt: true },
  });
  if (!session || session.ownerType !== 'ADMIN_USER') return false;
  if (session.siteId !== siteId) return false;
  if (session.revokedAt !== null || session.expiresAt < new Date()) return false;

  const admin = await prisma.admin_users.findUnique({
    where: { id: session.ownerId },
    select: { role: true, status: true },
  });
  if (admin?.status !== 'ACTIVE') return false;
  return admin.role === 'PLATFORM_ADMIN';
}
