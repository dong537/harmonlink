import { Injectable } from '@nestjs/common';
import { LedgerEntryType, prisma } from '@ipeasy/db';
import { Prisma } from '@ipeasy/db/generated/client';
import { AuthenticatedContext, requireUserContext } from '../../common/auth/auth-context';
import { ConfigService } from '../../common/config/config.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { SkuQuoteUseCase } from '../catalog/domain';
import { managedLineProjectionDesiredHash } from '../dedicated-line-projections/domain';
import { buildManagedLineProjectionRequest } from '../dedicated-line-projections/build-managed-line-projection-request';
import { WalletRepository } from '../wallet/wallet.repository';
import { ResolveActiveZoneUseCase } from '../zones/use-cases';
import { requireTenantId } from '../wallet/access';
import { lockActiveZone } from '../zones/zones.repository';
import { normalizeZoneCode } from '../zones/domain';
import { toDecimalString } from '../../common/money/money';

const DAY_MS = 24 * 60 * 60 * 1000;

type RenewalReplaySnapshot = {
  lineId: string;
  durationDays: number;
  zoneCode: string | null;
  amount: string;
  currency: string;
  status: string;
  expiresAt: string | null;
  desiredVersion: number;
};

@Injectable()
export class RenewDedicatedLineUseCase {
  constructor(
    private readonly quote: SkuQuoteUseCase,
    private readonly walletRepository: WalletRepository,
    private readonly config: ConfigService,
    private readonly resolveZone: ResolveActiveZoneUseCase,
  ) {}

  async execute(ctx: AuthenticatedContext, lineId: string, body: unknown) {
    requireUserContext(ctx);
    const tenantId = requireTenantId(ctx);
    const input = parseInput(body);
    const ledgerKey = renewalLedgerKey(ctx.siteId, tenantId, ctx.ownerId, input.idempotencyKey);

    // A committed renewal ledger entry is the source of truth for a retry.
    // Read and validate its immutable snapshot before resolving Zone, wallet,
    // line, catalog, quote, or provider state.
    const existingReplay = await prisma.ledger_entries.findUnique({ where: { idempotencyKey: ledgerKey } });
    if (existingReplay) {
      return replayRenewal(existingReplay, {
        siteId: ctx.siteId,
        tenantId,
        userId: ctx.ownerId,
        lineId,
        durationDays: input.durationDays,
        zoneCode: input.zoneCode,
      });
    }

    const selectedZone = await this.resolveZone.execute({
      siteId: ctx.siteId,
      tenantId,
      userId: ctx.ownerId,
    }, input.zoneCode);
    const replaceZone = input.zoneCode !== null;
    const wallet = await this.walletRepository.getWalletByUserId(ctx.ownerId, ctx.siteId, tenantId);
    const scopedLine = await prisma.dedicated_lines.findFirst({
      where: { id: lineId, siteId: ctx.siteId, tenantId, userId: ctx.ownerId },
      include: { sku: { select: { code: true } } },
    });
    if (!scopedLine) throw new AppError(ErrorCode.NOT_FOUND, 'dedicated_line_not_found', 404);
    assertRenewable(scopedLine.status);
    const quote = await this.quote.execute({
      siteId: ctx.siteId,
      tenantId,
      userId: ctx.ownerId,
      skuCode: scopedLine.sku.code,
      durationDays: input.durationDays,
      quantity: 1,
      currency: wallet.currency,
    });

    return prisma.$transaction(async (tx) => {
      // Re-check after the quote to close the race where another request
      // commits the same key while this request is resolving its quote.
      const existing = await tx.ledger_entries.findUnique({ where: { idempotencyKey: ledgerKey } });
      if (existing) {
        return replayRenewal(existing, {
          siteId: ctx.siteId,
          tenantId,
          userId: ctx.ownerId,
          lineId,
          durationDays: input.durationDays,
          zoneCode: input.zoneCode,
        });
      }

      const line = await tx.dedicated_lines.findFirst({
        where: { id: lineId, siteId: ctx.siteId, tenantId, userId: ctx.ownerId },
        include: {
          sku: { select: { code: true } },
          inboundProfile: { select: { inboundTag: true } },
          exitAssignment: { include: { residentialExit: { select: { expiresAt: true, status: true, endpointCiphertext: true, credentialCiphertext: true } } } },
          projections: { select: { id: true, nodeId: true } },
        },
      });
      if (!line) throw new AppError(ErrorCode.NOT_FOUND, 'dedicated_line_not_found', 404);
      assertRenewable(line.status);
      if (selectedZone) {
        await lockActiveZone(tx, {
          siteId: ctx.siteId,
          tenantId,
          userId: ctx.ownerId,
        }, selectedZone.id);
      }
      const assignment = line.exitAssignment;
      if (!assignment || assignment.status !== 'ACTIVE' || assignment.residentialExit.status !== 'ASSIGNED') {
        throw new AppError(ErrorCode.DEDICATED_LINE_CONFIG_INVALID, 'dedicated_line_exit_assignment_missing', 422);
      }
      const now = Date.now();
      const baseExpiry = Math.max(line.expiresAt?.getTime() ?? 0, now);
      const expiresAt = new Date(baseExpiry + input.durationDays * DAY_MS);
      if (!assignment.residentialExit.expiresAt || expiresAt.getTime() > assignment.residentialExit.expiresAt.getTime()) {
        throw new AppError(ErrorCode.DEDICATED_LINE_CONFIG_INVALID, 'dedicated_line_exit_expiry_insufficient', 422);
      }
      const ledger = await this.walletRepository.debitWalletTx(
        tx,
        wallet.id,
        quote.totalPrice,
        quote.currency,
        LedgerEntryType.RENEWAL,
        line.id,
        'dedicated_line_renewal',
        ledgerKey,
      );
      const desiredVersion = line.desiredVersion + 1;
      const request = buildManagedLineProjectionRequest({
        desiredVersion,
        inboundTag: line.inboundProfile.inboundTag,
        protocol: line.protocol,
        clientEmail: line.clientEmail,
        clientIdentityCiphertext: line.clientIdentityCiphertext,
        lineStatus: 'PROVISIONING',
        expiresAt,
        quotaBytes: line.quotaBytes,
        uplinkLimitBps: line.uplinkLimitBps,
        downlinkLimitBps: line.downlinkLimitBps,
        maxConnections: line.maxConnections,
        ipLimit: line.ipLimit,
        endpointCiphertext: assignment.residentialExit.endpointCiphertext,
        credentialCiphertext: assignment.residentialExit.credentialCiphertext,
      }, this.config.get('APP_ENCRYPTION_KEY'));
      const desiredHash = managedLineProjectionDesiredHash(request);
      const replaySnapshot: RenewalReplaySnapshot = {
        lineId: line.id,
        durationDays: input.durationDays,
        zoneCode: input.zoneCode,
        amount: quote.totalPrice,
        currency: quote.currency,
        status: 'PROVISIONING',
        expiresAt: expiresAt.toISOString(),
        desiredVersion,
      };
      await tx.ledger_entries.update({
        where: { id: ledger.id },
        data: { meta: { dedicatedLineRenewal: replaySnapshot } as Prisma.InputJsonObject },
      });
      await tx.dedicated_lines.update({
        where: { id: line.id },
        data: {
          status: 'PROVISIONING',
          desiredVersion,
          expiresAt,
          ...(replaceZone ? { zoneId: selectedZone!.id } : {}),
        },
      });
      await tx.dedicated_line_projections.updateMany({
        where: { dedicatedLineId: line.id },
        data: {
          desiredVersion,
          desiredHash,
          observedVersion: null,
          observedHash: null,
          nodeExternalId: null,
          status: 'PENDING',
          lastErrorCode: null,
          lastErrorDetail: Prisma.JsonNull,
        },
      });
      for (const projection of line.projections) {
        const jobKey = `projection:${line.id}:${projection.nodeId}:v${desiredVersion}`;
        await tx.external_jobs.create({
          data: {
            siteId: ctx.siteId,
            tenantId,
            userId: ctx.ownerId,
            dedicatedLineId: line.id,
            kind: 'APPLY_DEDICATED_LINE_PROJECTION',
            aggregateType: 'dedicated_line_projection',
            aggregateId: projection.id,
            desiredVersion,
            idempotencyKey: jobKey,
            dedupeKey: jobKey,
            payload: { projectionKey: `${line.id}:${projection.nodeId}` },
          },
        });
      }
      return toResult({ ...line, status: 'PROVISIONING', desiredVersion, expiresAt }, quote.totalPrice, quote.currency, false);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}

function parseInput(body: unknown): { durationDays: number; idempotencyKey: string; zoneCode: string | null } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError(ErrorCode.VALIDATION_ERROR, 'dedicated_line_renewal_body_invalid', 400);
  const value = body as Record<string, unknown>;
  const durationDays = value['durationDays'];
  const idempotencyKey = value['idempotencyKey'];
  if (!Number.isInteger(durationDays) || (durationDays as number) < 1 || (durationDays as number) > 3650) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'duration_days_invalid', 400);
  }
  if (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length < 1 || idempotencyKey.trim().length > 200) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'idempotency_key_invalid', 400);
  }
  return {
    durationDays: durationDays as number,
    idempotencyKey: idempotencyKey.trim(),
    zoneCode: normalizeOptionalZoneCode(value['zoneCode']),
  };
}

function normalizeOptionalZoneCode(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return normalizeZoneCode(value);
}

function renewalLedgerKey(siteId: string, tenantId: string, userId: string, idempotencyKey: string): string {
  return `dedicated-line-renewal:${siteId}:${tenantId}:${userId}:${idempotencyKey}`;
}

function replayRenewal(
  ledger: {
    siteId: string;
    tenantId: string;
    userId: string;
    type: LedgerEntryType;
    reason: string | null;
    relatedId: string | null;
    amount: Prisma.Decimal;
    currency: string;
    meta: Prisma.JsonValue | null;
  },
  request: {
    siteId: string;
    tenantId: string;
    userId: string;
    lineId: string;
    durationDays: number;
    zoneCode: string | null;
  },
) {
  if (
    ledger.siteId !== request.siteId
    || ledger.tenantId !== request.tenantId
    || ledger.userId !== request.userId
    || ledger.type !== LedgerEntryType.RENEWAL
    || ledger.reason !== 'dedicated_line_renewal'
    || ledger.relatedId !== request.lineId
  ) {
    throw new AppError(ErrorCode.IDEMPOTENCY_CONFLICT, 'dedicated_line_renewal_idempotency_conflict', 409);
  }

  const snapshot = readRenewalSnapshot(ledger.meta);
  if (
    snapshot.lineId !== request.lineId
    || snapshot.durationDays !== request.durationDays
    || snapshot.zoneCode !== request.zoneCode
  ) {
    throw new AppError(ErrorCode.IDEMPOTENCY_CONFLICT, 'dedicated_line_renewal_idempotency_conflict', 409);
  }

  const expectedAmount = toDecimalString(`-${snapshot.amount}`);
  if (ledger.amount.toString() !== expectedAmount || ledger.currency !== snapshot.currency) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'dedicated_line_renewal_snapshot_invalid', 500);
  }

  const expiresAt = snapshot.expiresAt === null ? null : new Date(snapshot.expiresAt);
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'dedicated_line_renewal_snapshot_invalid', 500);
  }
  return toResult(
    {
      id: snapshot.lineId,
      status: snapshot.status,
      expiresAt,
      desiredVersion: snapshot.desiredVersion,
    },
    snapshot.amount,
    snapshot.currency,
    true,
  );
}

function readRenewalSnapshot(value: Prisma.JsonValue | null): RenewalReplaySnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'dedicated_line_renewal_snapshot_missing', 500);
  }
  const candidate = (value as Record<string, unknown>)['dedicatedLineRenewal'];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'dedicated_line_renewal_snapshot_missing', 500);
  }
  const snapshot = candidate as Record<string, unknown>;
  if (
    typeof snapshot['lineId'] !== 'string'
    || !Number.isInteger(snapshot['durationDays'])
    || (typeof snapshot['zoneCode'] !== 'string' && snapshot['zoneCode'] !== null)
    || typeof snapshot['amount'] !== 'string'
    || typeof snapshot['currency'] !== 'string'
    || typeof snapshot['status'] !== 'string'
    || (typeof snapshot['expiresAt'] !== 'string' && snapshot['expiresAt'] !== null)
    || !Number.isInteger(snapshot['desiredVersion'])
  ) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'dedicated_line_renewal_snapshot_invalid', 500);
  }
  return snapshot as unknown as RenewalReplaySnapshot;
}

function assertRenewable(status: string): void {
  if (!['PROVISIONING', 'ACTIVE', 'DEGRADED', 'MIGRATING_AWAITING_ROUTE_IMPORT'].includes(status)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'dedicated_line_not_renewable', 422);
  }
}

function toResult(line: { id: string; status: string; expiresAt: Date | null; desiredVersion: number }, amount: string, currency: string, replayed: boolean) {
  return { lineId: line.id, status: line.status, expiresAt: line.expiresAt, desiredVersion: line.desiredVersion, charged: { amount, currency }, replayed };
}
