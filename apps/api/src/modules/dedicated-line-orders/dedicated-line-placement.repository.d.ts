export type DedicatedLinePlacementPlan = {
    policyId: string;
    inboundProfileId: string;
    inboundTag: string;
    protocol: 'VLESS' | 'VMESS' | 'MIXED';
    targetReplicaCount: number;
    minReadyReplicaCount: number;
    maxUnitsPerNode: number;
    allowedNodeIds: string[];
};
export declare class DedicatedLinePlacementRepository {
    resolveForOrder(input: {
        siteId: string;
        tenantId: string;
        userId: string;
        skuId: string;
        quantity: number;
    }): Promise<DedicatedLinePlacementPlan>;
}
