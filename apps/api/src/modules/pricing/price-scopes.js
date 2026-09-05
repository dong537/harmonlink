"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvePricingResourceIds = resolvePricingResourceIds;
exports.resolvePricingScopesForResources = resolvePricingScopesForResources;
const db_1 = require("@ipeasy/db");
const base_price_1 = require("./base-price");
const MAX_RESOURCE_SCOPE_DEPTH = 8;
async function resolvePricingResourceIds(siteId, resourceId) {
    const resource = await findPricingScopeResource(siteId, resourceId);
    if (!resource)
        return [resourceId];
    const scopeIds = [resource.id];
    const seen = new Set(scopeIds);
    let parentId = resource.parentId;
    let depth = 0;
    while (parentId && depth < MAX_RESOURCE_SCOPE_DEPTH) {
        if (seen.has(parentId))
            break;
        const parent = await findPricingScopeResource(siteId, parentId);
        if (!parent)
            break;
        if (parent.providerCode === resource.providerCode
            && parent.ipType === resource.ipType
            && parent.upstreamAccountId === resource.upstreamAccountId) {
            scopeIds.push(parent.id);
            seen.add(parent.id);
        }
        parentId = parent.parentId;
        depth += 1;
    }
    const countryCode = (0, base_price_1.resourceCountryCode)(resource.code);
    const countryResource = await db_1.prisma.platform_resources.findFirst({
        where: {
            siteId,
            providerCode: resource.providerCode,
            upstreamAccountId: resource.upstreamAccountId,
            ipType: resource.ipType,
            type: 'COUNTRY',
            code: countryCode,
        },
        select: { id: true },
    });
    if (countryResource && !seen.has(countryResource.id)) {
        scopeIds.push(countryResource.id);
    }
    return scopeIds;
}
async function resolvePricingScopesForResources(siteId, resources) {
    const entries = await Promise.all(resources.map(async (resource) => [resource.id, await resolvePricingResourceIds(siteId, resource.id)]));
    return new Map(entries);
}
function findPricingScopeResource(siteId, resourceId) {
    return db_1.prisma.platform_resources.findFirst({
        where: { id: resourceId, siteId },
        select: {
            id: true,
            parentId: true,
            code: true,
            providerCode: true,
            upstreamAccountId: true,
            ipType: true,
            type: true,
        },
    });
}
//# sourceMappingURL=price-scopes.js.map