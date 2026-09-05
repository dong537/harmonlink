"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROXY_SELLER_MIN_INVENTORY_FRESHNESS_TTL_SECONDS = void 0;
exports.isInventorySnapshotStale = isInventorySnapshotStale;
exports.hasBuyableInventory = hasBuyableInventory;
exports.effectiveInventoryFreshnessTtlSeconds = effectiveInventoryFreshnessTtlSeconds;
exports.PROXY_SELLER_MIN_INVENTORY_FRESHNESS_TTL_SECONDS = 6 * 60 * 60;
function isInventorySnapshotStale(snapshot, now = new Date()) {
    const expiresAt = snapshot.capturedAt.getTime() + effectiveInventoryFreshnessTtlSeconds(snapshot) * 1000;
    return snapshot.isStale || expiresAt < now.getTime();
}
function hasBuyableInventory(_providerCode, stock) {
    return stock !== null && stock > 0;
}
function effectiveInventoryFreshnessTtlSeconds(snapshot) {
    if (snapshot.providerCode === 'PR') {
        return Math.max(snapshot.freshnessTtlSeconds, exports.PROXY_SELLER_MIN_INVENTORY_FRESHNESS_TTL_SECONDS);
    }
    return snapshot.freshnessTtlSeconds;
}
//# sourceMappingURL=domain.js.map