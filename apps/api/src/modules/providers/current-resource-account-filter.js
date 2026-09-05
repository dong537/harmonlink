"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCurrentResourceAccountWhere = buildCurrentResourceAccountWhere;
exports.resolveCurrentResourceAccountIdsForProvider = resolveCurrentResourceAccountIdsForProvider;
const db_1 = require("@ipeasy/db");
const provider_account_order_1 = require("./provider-account-order");
const NATIVE_PROVIDER_CODES = ['IPIPD', 'NINE_EIGHT_FIVE', 'PR'];
const UPSTREAM_API_PROVIDER_CODE = 'UPSTREAM_API';
async function buildCurrentResourceAccountWhere(siteId, options = {}) {
    const entries = [
        ...(await resolveCurrentNativeProviderAccounts(siteId, options)),
        ...(await resolveCurrentUpstreamApiAccounts(siteId, options)),
    ];
    if (entries.length === 0)
        return { id: { in: [] } };
    return {
        OR: entries.map((entry) => ({
            providerCode: entry.providerCode,
            upstreamAccountId: entry.accountId,
        })),
    };
}
async function resolveCurrentResourceAccountIdsForProvider(siteId, providerCode) {
    if (NATIVE_PROVIDER_CODES.includes(providerCode)) {
        const rows = await db_1.prisma.provider_accounts.findMany({
            where: { siteId, providerCode },
            select: {
                id: true,
                tenantId: true,
                status: true,
            },
            orderBy: [{ tenantId: 'asc' }, ...provider_account_order_1.CURRENT_PROVIDER_ACCOUNT_ORDER_BY],
        });
        return activeCurrentIdsByScope(rows);
    }
    if (providerCode === UPSTREAM_API_PROVIDER_CODE) {
        const rows = await db_1.prisma.upstream_api_accounts.findMany({
            where: { siteId },
            select: {
                id: true,
                tenantId: true,
                status: true,
            },
            orderBy: [{ tenantId: 'asc' }, ...provider_account_order_1.CURRENT_UPSTREAM_API_ACCOUNT_ORDER_BY],
        });
        return activeCurrentIdsByScope(rows);
    }
    return [];
}
async function resolveCurrentNativeProviderAccounts(siteId, options) {
    const providerCodes = NATIVE_PROVIDER_CODES.filter((code) => !options.providerCode || options.providerCode === code);
    if (providerCodes.length === 0)
        return [];
    const rows = await db_1.prisma.provider_accounts.findMany({
        where: {
            siteId,
            providerCode: { in: providerCodes },
            OR: tenantScopeWhere(options.tenantId),
        },
        select: {
            id: true,
            tenantId: true,
            providerCode: true,
            status: true,
        },
        orderBy: [{ providerCode: 'asc' }, ...provider_account_order_1.CURRENT_PROVIDER_ACCOUNT_ORDER_BY],
    });
    const entries = [];
    for (const providerCode of providerCodes) {
        const scopedRows = rows.filter((row) => row.providerCode === providerCode);
        const tenantRow = options.tenantId
            ? scopedRows.find((row) => row.tenantId === options.tenantId)
            : null;
        const siteRow = scopedRows.find((row) => row.tenantId === null);
        const current = tenantRow?.status === 'ACTIVE' ? tenantRow : siteRow;
        if (current?.status === 'ACTIVE') {
            entries.push({ providerCode, accountId: current.id });
        }
    }
    return entries;
}
async function resolveCurrentUpstreamApiAccounts(siteId, options) {
    if (options.providerCode && options.providerCode !== UPSTREAM_API_PROVIDER_CODE)
        return [];
    const rows = await db_1.prisma.upstream_api_accounts.findMany({
        where: {
            siteId,
            OR: tenantScopeWhere(options.tenantId),
        },
        select: {
            id: true,
            tenantId: true,
            status: true,
        },
        orderBy: provider_account_order_1.CURRENT_UPSTREAM_API_ACCOUNT_ORDER_BY,
    });
    const tenantRow = options.tenantId
        ? rows.find((row) => row.tenantId === options.tenantId)
        : null;
    const siteRow = rows.find((row) => row.tenantId === null);
    const current = tenantRow?.status === 'ACTIVE' ? tenantRow : siteRow;
    return current?.status === 'ACTIVE'
        ? [{ providerCode: UPSTREAM_API_PROVIDER_CODE, accountId: current.id }]
        : [];
}
function tenantScopeWhere(tenantId) {
    return tenantId ? [{ tenantId }, { tenantId: null }] : [{ tenantId: null }];
}
function activeCurrentIdsByScope(rows) {
    const latestByScope = new Map();
    for (const row of rows) {
        const key = row.tenantId ?? '';
        if (!latestByScope.has(key))
            latestByScope.set(key, row);
    }
    return [...latestByScope.values()]
        .filter((row) => row.status === 'ACTIVE')
        .map((row) => row.id);
}
//# sourceMappingURL=current-resource-account-filter.js.map