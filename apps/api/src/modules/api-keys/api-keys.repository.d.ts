import { Prisma } from '@ipeasy/db';
import { PageQueryDto, PageResult } from '../../common/pagination/pagination.dto';
export type ApiKey = Prisma.api_keysGetPayload<Record<string, never>>;
export declare class ApiKeysRepository {
    findByKeyHash(keyHash: string): Promise<ApiKey | null>;
    findById(id: string): Promise<ApiKey>;
    listForOwner(owner: {
        ownerId: string;
        siteId: string;
        tenantId: string;
    }, query: PageQueryDto): Promise<PageResult<ApiKey>>;
    create(data: {
        siteId: string;
        tenantId: string;
        ownerId: string;
        ownerType: 'USER' | 'TENANT_ADMIN';
        name: string;
        keyHash: string;
        keyPrefix: string;
        scopes: string[];
        ipWhitelist: string[];
    }): Promise<ApiKey>;
    revoke(id: string): Promise<void>;
    updateLastUsed(id: string): Promise<void>;
}
