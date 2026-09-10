import { Logger } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';

/**
 * Authoritative shape of `external_jobs.payload.request` for dedicated-line
 * orders. The producer (CreateDedicatedLineOrderUseCase) builds every field
 * except `providerResourceId`, which the inventory repository injects from the
 * route snapshot at enqueue time. The consumer
 * (ProcessDedicatedLineOrderUseCase) parses back exactly this shape.
 *
 * `protocol` is the upstream egress protocol we purchase; `lineProtocol` is the
 * customer-facing inbound protocol the projection serves. They are unrelated.
 */
export type DedicatedLineOrderRequest = {
  durationDays: number;
  currency: string;
  protocol: 'SOCKS5';
  providerResourceId: string;
  placementPolicyId: string;
  inboundProfileId: string;
  inboundTag: string;
  lineProtocol: 'VLESS' | 'VMESS' | 'MIXED';
  maxReplicaFanout: number;
  regionCode?: string;
  businessType?: string;
};

export type DedicatedLineOrderRequestDraft = Omit<DedicatedLineOrderRequest, 'providerResourceId'>;

export interface ReserveDedicatedLineStockInput {
  siteId: string;
  tenantId: string;
  userId: string;
  zoneId?: string | null;
  /** Normalized user-facing Zone code used for stable idempotency replay checks. */
  zoneCode?: string | null;
  providerCode: string;
  providerAccountId: string;
  skuId: string;
  countryCode: string;
  quantity: number;
  idempotencyKey: string;
  orderSnapshot: {
    skuCode: string;
    skuName: string;
    regionCode?: string;
    businessType?: string;
    durationDays: number;
    unitPrice: string;
    totalPrice: string;
    currency: string;
    priceSource: string;
    contractVersion: number;
  };
  charge: {
    amount: string;
    currency: string;
    idempotencyKey: string;
  };
  jobPayload: DedicatedLineOrderRequestDraft;
}

/**
 * The immutable request fields used to validate a replay before consulting
 * any current catalog, inventory, placement, or provider state.
 */
export type DedicatedLineOrderReplayRequest = {
  skuCode: string;
  countryCode: string;
  quantity: number;
  durationDays: number;
  currency: string;
  regionCode: string | null;
  businessType: string | null;
  zoneCode: string | null;
};

export type DedicatedLineOrderReplay = {
  status: 'QUEUED';
  orderId: string;
  reservationId: string;
  jobId: string;
  skuCode: string;
  countryCode: string;
  quantity: number;
  durationDays: number;
  unitPrice: string;
  totalPrice: string;
  currency: string;
  priceSource: string;
  contractVersion: number;
  replayed: true;
};

export type InventoryLowAlert = {
  siteId: string;
  tenantId: string;
  userId: string;
  // Null when no usable route was found at all: there is no snapshot, so there is
  // no provider to name. siteId + skuId + countryCode is the scope that always holds.
  providerCode: string | null;
  providerAccountId: string | null;
  skuId: string;
  countryCode: string;
  requestedQuantity: number;
  availableQuantity: number;
  sourceVersion: string | null;
};

export type ReserveDedicatedLineStockResult = {
  kind: 'RESERVED';
  reservationId: string;
  orderId: string;
  jobId: string;
  snapshotId: string;
  sourceVersion: string;
  replayed: boolean;
};

export type InventoryInsufficientResult = {
  kind: 'INSUFFICIENT';
  providerCode: string;
  providerAccountId: string;
  skuId: string;
  countryCode: string;
  requestedQuantity: number;
  availableQuantity: number;
  sourceVersion: string | null;
};

export interface InventoryReservationSource {
  reserveAndEnqueue(
    input: ReserveDedicatedLineStockInput,
  ): Promise<ReserveDedicatedLineStockResult | InventoryInsufficientResult>;
  enqueueInventoryLowAlert(alert: InventoryLowAlert): Promise<void>;
}

export class ReserveDedicatedLineStockUseCase {
  private readonly logger = new Logger(ReserveDedicatedLineStockUseCase.name);

  constructor(private readonly source: InventoryReservationSource) {}

  async execute(input: ReserveDedicatedLineStockInput): Promise<ReserveDedicatedLineStockResult> {
    assertInput(input);
    const normalizedInput = {
      ...input,
      zoneId: input.zoneId ?? null,
      providerCode: input.providerCode.trim(),
      countryCode: input.countryCode.trim().toUpperCase(),
      idempotencyKey: input.idempotencyKey.trim(),
    };

    const result = await this.source.reserveAndEnqueue(normalizedInput);
    if (result.kind === 'INSUFFICIENT') {
      const outOfStock = new AppError(ErrorCode.UPSTREAM_OUT_OF_STOCK, 'dedicated_line_inventory_insufficient', 422, undefined, {
        providerCode: result.providerCode,
        skuId: result.skuId,
        countryCode: result.countryCode,
        requestedQuantity: result.requestedQuantity,
        availableQuantity: result.availableQuantity,
        sourceVersion: result.sourceVersion,
      });
      try {
        await this.source.enqueueInventoryLowAlert({
          siteId: normalizedInput.siteId,
          tenantId: normalizedInput.tenantId,
          userId: normalizedInput.userId,
          ...result,
        });
      } catch (error: unknown) {
        // Alerting is a side channel. Preserve the truthful 422 even when the
        // outbox/database is unavailable, while leaving an operator-visible trace.
        this.logger.error(
          `inventory_low_alert_enqueue_failed site=${normalizedInput.siteId} sku=${result.skuId} country=${result.countryCode}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
      throw outOfStock;
    }

    return result;
  }
}

function assertInput(input: ReserveDedicatedLineStockInput): void {
  if (!input.siteId || !input.tenantId || !input.userId || !input.providerCode || !input.providerAccountId || !input.skuId) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'dedicated_line_order_scope_required', 400);
  }
  if (!/^[A-Z]{2}$/.test(input.countryCode.trim().toUpperCase())) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'country_code_invalid', 400);
  }
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'quantity_invalid', 400);
  }
  if (!input.idempotencyKey.trim()) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'idempotency_key_required', 400);
  }
  if (input.zoneId !== undefined && input.zoneId !== null && (typeof input.zoneId !== 'string' || !input.zoneId.trim())) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'zone_id_invalid', 400);
  }
  if (!input.charge || typeof input.charge.amount !== 'string' || !input.charge.amount.trim()) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'dedicated_line_charge_required', 400);
  }
  if (!input.charge.currency?.trim() || !input.charge.idempotencyKey?.trim()) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'dedicated_line_charge_required', 400);
  }
  if (!input.jobPayload || typeof input.jobPayload !== 'object' || Array.isArray(input.jobPayload)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'job_payload_invalid', 400);
  }
  const snapshot = input.orderSnapshot;
  if (
    !snapshot
    || !snapshot.skuCode?.trim()
    || !snapshot.skuName?.trim()
    || snapshot.durationDays !== input.jobPayload['durationDays']
    || !snapshot.unitPrice?.trim()
    || !snapshot.totalPrice?.trim()
    || !snapshot.currency?.trim()
    || !snapshot.priceSource?.trim()
    || !Number.isInteger(snapshot.contractVersion)
    || snapshot.contractVersion < 1
  ) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'dedicated_line_order_snapshot_invalid', 400);
  }
}

export type ExpiredReservationCandidate = {
  reservationId: string;
  siteId: string;
  quantity: number;
  jobId: string | null;
  // True only when the purchase job provably never ran, so the upstream provider
  // was never contacted and the money can be safely returned.
  neverIssued: boolean;
};

export type ReclaimExpiredReservationsResult = {
  scanned: number;
  reclaimed: number;
  skippedIssued: number;
};

export interface ExpiredReservationSource {
  findExpiredCandidates(now: Date, limit: number): Promise<ExpiredReservationCandidate[]>;
  reclaim(candidate: ExpiredReservationCandidate, now: Date): Promise<boolean>;
}

// Returns stock and money for reservations that expired before their purchase was
// ever issued. A reservation whose purchase already reached the provider is left
// untouched on purpose: the upstream resource may be paid for, so releasing it
// here would refund a delivered order and oversell the inventory.
export class ReclaimExpiredReservationsUseCase {
  constructor(private readonly source: ExpiredReservationSource) {}

  async execute(now: Date, limit = 100): Promise<ReclaimExpiredReservationsResult> {
    const candidates = await this.source.findExpiredCandidates(now, limit);
    let reclaimed = 0;
    let skippedIssued = 0;

    for (const candidate of candidates) {
      if (!candidate.neverIssued) {
        skippedIssued += 1;
        continue;
      }
      if (await this.source.reclaim(candidate, now)) reclaimed += 1;
    }

    return { scanned: candidates.length, reclaimed, skippedIssued };
  }
}
