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
export type InventoryLowAlert = {
    siteId: string;
    tenantId: string;
    userId: string;
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
    reserveAndEnqueue(input: ReserveDedicatedLineStockInput): Promise<ReserveDedicatedLineStockResult | InventoryInsufficientResult>;
    enqueueInventoryLowAlert(alert: InventoryLowAlert): Promise<void>;
}
export declare class ReserveDedicatedLineStockUseCase {
    private readonly source;
    constructor(source: InventoryReservationSource);
    execute(input: ReserveDedicatedLineStockInput): Promise<ReserveDedicatedLineStockResult>;
}
export type ExpiredReservationCandidate = {
    reservationId: string;
    siteId: string;
    quantity: number;
    jobId: string | null;
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
export declare class ReclaimExpiredReservationsUseCase {
    private readonly source;
    constructor(source: ExpiredReservationSource);
    execute(now: Date, limit?: number): Promise<ReclaimExpiredReservationsResult>;
}
