export declare function resolvePricingResourceIds(siteId: string, resourceId: string): Promise<string[]>;
export declare function resolvePricingScopesForResources(siteId: string, resources: Array<{
    id: string;
}>): Promise<Map<string, string[]>>;
