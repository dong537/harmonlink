import { AuthenticatedContext } from '../../common/auth/auth-context';
import { CatalogRepository } from './catalog.repository';
import { SkuQuoteUseCase } from './domain';
type CustomerQuoteQuery = {
    skuCode: string;
    durationDays: string;
    quantity?: string;
    currency: string;
};
type AdminQuoteQuery = CustomerQuoteQuery & {
    tenantId: string;
    userId: string;
};
export declare class CatalogController {
    private readonly repository;
    private readonly quoteUseCase;
    constructor(repository: CatalogRepository, quoteUseCase: SkuQuoteUseCase);
    listCustomerSkus(ctx: AuthenticatedContext): Promise<{
        id: string;
        code: string;
        name: string;
        description: string | null;
        capabilities: Record<string, unknown>;
        contractVersion: number;
        isActive: boolean;
        isVisible: boolean;
    }[]>;
    listAdminSkus(ctx: AuthenticatedContext): Promise<{
        id: string;
        code: string;
        name: string;
        description: string | null;
        capabilities: Record<string, unknown>;
        contractVersion: number;
        isActive: boolean;
        isVisible: boolean;
    }[]>;
    quoteCustomer(ctx: AuthenticatedContext, query: CustomerQuoteQuery): Promise<Readonly<{
        skuId: string;
        skuCode: string;
        durationDays: number;
        quantity: number;
        unitPrice: string;
        totalPrice: string;
        currency: string;
        priceSource: import("./domain").SkuPriceSource;
        contractVersion: number;
        contract: Readonly<import("./domain").SkuQuoteContract>;
    }>>;
    quoteAdmin(ctx: AuthenticatedContext, query: AdminQuoteQuery): Promise<Readonly<{
        skuId: string;
        skuCode: string;
        durationDays: number;
        quantity: number;
        unitPrice: string;
        totalPrice: string;
        currency: string;
        priceSource: import("./domain").SkuPriceSource;
        contractVersion: number;
        contract: Readonly<import("./domain").SkuQuoteContract>;
    }>>;
}
export {};
