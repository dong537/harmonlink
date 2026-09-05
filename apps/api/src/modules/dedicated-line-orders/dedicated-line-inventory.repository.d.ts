import type { InventoryItem, ProviderCode } from '../providers/provider.types';
import { WalletRepository } from '../wallet/wallet.repository';
import { type InventoryInsufficientResult, type InventoryLowAlert, type InventoryReservationSource, type ReserveDedicatedLineStockInput, type ReserveDedicatedLineStockResult } from './domain';
export declare class DedicatedLineInventoryRepository implements InventoryReservationSource {
    private readonly walletRepository;
    constructor(walletRepository: WalletRepository);
    findFreshRoute(input: {
        siteId: string;
        tenantId: string;
        skuId: string;
        countryCode: string;
    }): Promise<{
        providerCode: string;
        providerAccountId: string;
        providerResourceId: string;
    } | null>;
    listFreshLocations(input: {
        siteId: string;
        tenantId: string;
    }): Promise<Array<{
        countryCode: string;
        availableQuantity: number;
    }>>;
    syncProviderSnapshot(input: {
        siteId: string;
        providerAccountId: string;
        providerCode: ProviderCode;
        items: InventoryItem[];
        capturedAt: Date;
    }): Promise<{
        snapshots: number;
        mappedSkus: number;
    }>;
    reserveAndEnqueue(input: ReserveDedicatedLineStockInput): Promise<ReserveDedicatedLineStockResult | InventoryInsufficientResult>;
    enqueueInventoryLowAlert(alert: InventoryLowAlert): Promise<void>;
}
