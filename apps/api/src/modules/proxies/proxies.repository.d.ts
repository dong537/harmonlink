import { prisma, Prisma, ProxyStatus } from '@ipeasy/db';
import { PageQueryDto, PageResult } from '../../common/pagination/pagination.dto';
export type ProxyInstance = Prisma.proxy_instancesGetPayload<Record<string, never>>;
type PrismaTransactionClient = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;
export type ProxyListQuery = PageQueryDto & {
    tenantId?: string;
    userId?: string;
    countryCode?: string;
    orderId?: string;
    status?: ProxyStatus;
};
export declare class ProxiesRepository {
    createMany(tx: PrismaTransactionClient, data: Prisma.proxy_instancesCreateManyInput[]): Promise<void>;
    findByUserId(userId: string, siteId: string, tenantId: string, query: ProxyListQuery): Promise<PageResult<ProxyInstance>>;
    listForAdmin(siteId: string, tenantId: string | null, query: ProxyListQuery): Promise<PageResult<ProxyInstance>>;
    findById(id: string): Promise<ProxyInstance | null>;
    findByOrderId(orderId: string, userId: string, tenantId: string): Promise<ProxyInstance[]>;
    updateStatus(id: string, status: ProxyStatus): Promise<ProxyInstance>;
    findAllActiveByUserId(userId: string, siteId: string, tenantId: string): Promise<ProxyInstance[]>;
}
export {};
