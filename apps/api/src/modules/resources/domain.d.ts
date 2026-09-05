export interface InventoryFreshnessInput {
    capturedAt: Date;
    freshnessTtlSeconds: number;
    isStale: boolean;
    providerCode?: string | null;
}
export declare const PROXY_SELLER_MIN_INVENTORY_FRESHNESS_TTL_SECONDS: number;
export declare function isInventorySnapshotStale(snapshot: InventoryFreshnessInput, now?: Date): boolean;
export declare function hasBuyableInventory(_providerCode: string, stock: number | null): boolean;
export declare function effectiveInventoryFreshnessTtlSeconds(snapshot: InventoryFreshnessInput): number;
