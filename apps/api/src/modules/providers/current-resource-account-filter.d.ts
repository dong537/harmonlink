import { Prisma } from '@ipeasy/db';
type CurrentResourceAccountFilterOptions = {
    tenantId?: string | null;
    providerCode?: string | null;
};
export declare function buildCurrentResourceAccountWhere(siteId: string, options?: CurrentResourceAccountFilterOptions): Promise<Prisma.platform_resourcesWhereInput>;
export declare function resolveCurrentResourceAccountIdsForProvider(siteId: string, providerCode: string): Promise<string[]>;
export {};
