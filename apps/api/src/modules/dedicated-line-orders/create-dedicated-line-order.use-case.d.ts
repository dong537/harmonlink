import { AuthenticatedContext } from '../../common/auth/auth-context';
import { CatalogRepository } from '../catalog/catalog.repository';
import { SkuQuoteUseCase } from '../catalog/domain';
import { DedicatedLineInventoryRepository } from './dedicated-line-inventory.repository';
import { DedicatedLinePlacementRepository } from './dedicated-line-placement.repository';
import { ReserveDedicatedLineStockUseCase } from './domain';
export interface CreateDedicatedLineOrderInput {
    skuCode: string;
    quantity: number;
    durationDays: number;
    countryCode: string;
    currency: string;
    idempotencyKey: string;
    regionCode?: string;
    businessType?: string;
}
export interface CreateDedicatedLineOrderResult {
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
    replayed: boolean;
}
export declare class CreateDedicatedLineOrderUseCase {
    private readonly catalog;
    private readonly quote;
    private readonly inventory;
    private readonly placement;
    private readonly reserveStock;
    private readonly logger;
    constructor(catalog: CatalogRepository, quote: SkuQuoteUseCase, inventory: DedicatedLineInventoryRepository, placement: DedicatedLinePlacementRepository, reserveStock: ReserveDedicatedLineStockUseCase);
    execute(ctx: AuthenticatedContext, input: CreateDedicatedLineOrderInput): Promise<CreateDedicatedLineOrderResult>;
    private alertNoUsableRoute;
}
