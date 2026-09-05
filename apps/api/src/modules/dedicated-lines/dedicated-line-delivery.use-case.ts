import { Injectable } from '@nestjs/common';
import { prisma } from '@ipeasy/db';
import { AuthenticatedContext, requireUserContext } from '../../common/auth/auth-context';
import { ConfigService } from '../../common/config/config.service';
import { decryptAesGcm } from '../../common/crypto/aes-gcm';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';

// Exactly the columns the list/get queries select. Declaring the full model row
// here would let a missing `select` entry typecheck and then read undefined at
// runtime, which is how clientEmail went missing from the v1-compat payload.
type DeliveryLineRow = {
  id: string;
  legacyId: number;
  status: string;
  countryCode: string;
  protocol: string;
  expiresAt: Date | null;
  clientEmail: string;
  clientIdentityCiphertext: string;
  quotaBytes: bigint | null;
  uplinkLimitBps: bigint | null;
  downlinkLimitBps: bigint | null;
  maxConnections: number | null;
  ipLimit: number | null;
  legacyRemark: string | null;
  sku: { code: string; name: string } | null;
  dedicatedLineOrder: { id: string } | null;
  inboundProfile: { inboundTag: string };
  deliveryRoutes: Array<{ domains: Array<{ hostname: string; port: number; isPrimary: boolean }> }>;
  projections: Array<{ status: string }>;
};

@Injectable()
export class DedicatedLineDeliveryUseCase {
  constructor(private readonly config: ConfigService) {}

  async list(ctx: AuthenticatedContext) {
    requireUserContext(ctx);
    const lines = await prisma.dedicated_lines.findMany({
      where: { siteId: ctx.siteId, tenantId: ctx.tenantId ?? '', userId: ctx.ownerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        legacyId: true,
        status: true,
        countryCode: true,
        protocol: true,
        expiresAt: true,
        clientEmail: true,
        clientIdentityCiphertext: true,
        quotaBytes: true,
        uplinkLimitBps: true,
        downlinkLimitBps: true,
        maxConnections: true,
        ipLimit: true,
        legacyRemark: true,
        sku: { select: { code: true, name: true } },
        dedicatedLineOrder: { select: { id: true } },
        inboundProfile: { select: { inboundTag: true } },
        deliveryRoutes: { where: { isCurrent: true }, select: { domains: { select: { hostname: true, port: true, isPrimary: true } } } },
        projections: { where: { migrationId: null }, select: { status: true } },
      },
    });
    return lines.map((line) => this.toDelivery(line));
  }

  async get(ctx: AuthenticatedContext, lineId: string) {
    requireUserContext(ctx);
    const line = await prisma.dedicated_lines.findFirst({
      where: { id: lineId, siteId: ctx.siteId, tenantId: ctx.tenantId ?? '', userId: ctx.ownerId },
      select: {
        id: true,
        legacyId: true,
        status: true,
        countryCode: true,
        protocol: true,
        expiresAt: true,
        clientEmail: true,
        clientIdentityCiphertext: true,
        quotaBytes: true,
        uplinkLimitBps: true,
        downlinkLimitBps: true,
        maxConnections: true,
        ipLimit: true,
        legacyRemark: true,
        sku: { select: { code: true, name: true } },
        dedicatedLineOrder: { select: { id: true } },
        inboundProfile: { select: { inboundTag: true } },
        deliveryRoutes: { where: { isCurrent: true }, select: { domains: { select: { hostname: true, port: true, isPrimary: true } } } },
        projections: { where: { migrationId: null }, select: { status: true } },
      },
    });
    if (!line) throw new AppError(ErrorCode.NOT_FOUND, 'dedicated_line_not_found', 404);
    return this.toDelivery(line);
  }

  private toDelivery(line: DeliveryLineRow) {
    const route = line.deliveryRoutes[0];
    const ready = line.status === 'ACTIVE' || line.status === 'DEGRADED';
    return {
      id: line.id,
      legacyId: line.legacyId,
      orderNo: line.dedicatedLineOrder?.id ?? line.id,
      sku: line.sku ?? null,
      status: line.status,
      countryCode: line.countryCode,
      protocol: line.protocol,
      expiresAt: line.expiresAt,
      clientEmail: line.clientEmail,
      inboundTag: line.inboundProfile.inboundTag,
      limits: {
        trafficLimitBytes: (line.quotaBytes ?? 0n).toString(),
        uplinkLimitBps: (line.uplinkLimitBps ?? 0n).toString(),
        downlinkLimitBps: (line.downlinkLimitBps ?? 0n).toString(),
        maxConnections: line.maxConnections ?? 0,
        ipLimit: line.ipLimit ?? 0,
      },
      projections: { ready: line.projections.filter((projection) => projection.status === 'READY').length, total: line.projections.length },
      domains: route?.domains.map((domain) => ({ hostname: domain.hostname, port: domain.port, isPrimary: domain.isPrimary })) ?? [],
      client: ready ? this.decryptClient(line.clientIdentityCiphertext, line.clientEmail) : null,
      legacyRemark: line.legacyRemark ?? null,
    };
  }

  private decryptClient(ciphertext: string, email: string): { email: string; id?: string; user?: string; password?: string } {
    try {
      const identity: unknown = JSON.parse(decryptAesGcm(ciphertext, this.config.get('APP_ENCRYPTION_KEY')));
      if (!identity || typeof identity !== 'object' || Array.isArray(identity)) throw new Error('invalid_identity');
      const value = identity as Record<string, unknown>;
      if (typeof value['id'] === 'string' && value['id']) return { email, id: value['id'] };
      if (typeof value['user'] === 'string' && typeof value['password'] === 'string' && value['user'] && value['password']) {
        return { email, user: value['user'], password: value['password'] };
      }
      throw new Error('invalid_identity');
    } catch {
      throw new AppError(ErrorCode.DEDICATED_LINE_CONFIG_INVALID, 'dedicated_line_client_identity_invalid', 500);
    }
  }
}
