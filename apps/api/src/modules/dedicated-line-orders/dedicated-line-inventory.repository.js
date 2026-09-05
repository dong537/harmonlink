"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DedicatedLineInventoryRepository = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const db_1 = require("@ipeasy/db");
const client_1 = require("@ipeasy/db/generated/client");
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
const bark_alert_outbox_repository_1 = require("../alerts/bark-alert-outbox.repository");
const inventory_freshness_1 = require("../resources/inventory-freshness");
const wallet_repository_1 = require("../wallet/wallet.repository");
const RESERVATION_TTL_MS = 5 * 60 * 1000;
const PROVIDER_ORDER_JOB_KIND = 'PROVIDER_DEDICATED_LINE_ORDER';
let DedicatedLineInventoryRepository = class DedicatedLineInventoryRepository {
    walletRepository;
    constructor(walletRepository) {
        this.walletRepository = walletRepository;
    }
    async findFreshRoute(input) {
        const snapshots = await db_1.prisma.dedicated_line_inventory_snapshots.findMany({
            where: {
                siteId: input.siteId,
                skuId: input.skuId,
                countryCode: input.countryCode.trim().toUpperCase(),
                expiresAt: { gt: new Date() },
            },
            orderBy: [{ capturedAt: 'desc' }, { createdAt: 'desc' }],
            take: 50,
            include: { providerAccount: { select: { status: true, tenantId: true } } },
        });
        const selected = snapshots.find((snapshot) => snapshot.providerAccount.status === 'ACTIVE'
            && (snapshot.providerAccount.tenantId === null || snapshot.providerAccount.tenantId === input.tenantId)
            && snapshot.quantity - snapshot.reservedQuantity > 0);
        return selected
            ? {
                providerCode: selected.providerCode,
                providerAccountId: selected.providerAccountId,
                providerResourceId: selected.providerResourceId,
            }
            : null;
    }
    async listFreshLocations(input) {
        const snapshots = await db_1.prisma.dedicated_line_inventory_snapshots.findMany({
            where: { siteId: input.siteId, expiresAt: { gt: new Date() } },
            select: {
                countryCode: true,
                quantity: true,
                reservedQuantity: true,
                providerAccount: { select: { status: true, tenantId: true } },
                sku: { select: { capabilities: true, isActive: true, isVisible: true } },
            },
        });
        const byCountry = new Map();
        for (const snapshot of snapshots) {
            if (snapshot.providerAccount.status !== 'ACTIVE'
                || (snapshot.providerAccount.tenantId !== null && snapshot.providerAccount.tenantId !== input.tenantId)
                || !snapshot.sku.isActive
                || !snapshot.sku.isVisible
                || !isDedicatedLineSku(snapshot.sku.capabilities))
                continue;
            const available = Math.max(0, snapshot.quantity - snapshot.reservedQuantity);
            if (available > 0) {
                const country = snapshot.countryCode.trim().toUpperCase();
                byCountry.set(country, (byCountry.get(country) ?? 0) + available);
            }
        }
        return [...byCountry.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([countryCode, availableQuantity]) => ({ countryCode, availableQuantity }));
    }
    async syncProviderSnapshot(input) {
        const skus = await db_1.prisma.service_skus.findMany({
            where: { siteId: input.siteId, isActive: true },
            select: { id: true, capabilities: true },
        });
        const ttlSeconds = (0, inventory_freshness_1.inventoryFreshnessTtlSeconds)(input.providerCode);
        let snapshots = 0;
        let mappedSkus = 0;
        for (const sku of skus) {
            const source = readInventorySource(sku.capabilities, input.providerCode);
            if (!source)
                continue;
            const allowed = new Set(source.providerResourceIds);
            let mappedThisSku = false;
            for (const item of input.items) {
                if (!allowed.has(item.providerResourceId))
                    continue;
                mappedThisSku = true;
                const countryCode = item.countryCode.trim().toUpperCase();
                const sourceVersion = stableSnapshotVersion(input, sku.id, [item.providerResourceId]);
                const expiresAt = new Date(input.capturedAt.getTime() + ttlSeconds * 1000);
                const existing = await db_1.prisma.dedicated_line_inventory_snapshots.findUnique({
                    where: {
                        siteId_providerAccountId_skuId_countryCode_providerResourceId_sourceVersion: {
                            siteId: input.siteId,
                            providerAccountId: input.providerAccountId,
                            skuId: sku.id,
                            countryCode,
                            providerResourceId: item.providerResourceId,
                            sourceVersion,
                        },
                    },
                    select: { id: true, reservedQuantity: true },
                });
                if (existing) {
                    await db_1.prisma.dedicated_line_inventory_snapshots.update({
                        where: { id: existing.id },
                        data: {
                            quantity: Math.max(item.stock, existing.reservedQuantity),
                            capturedAt: input.capturedAt,
                            expiresAt,
                        },
                    });
                }
                else {
                    await db_1.prisma.dedicated_line_inventory_snapshots.create({
                        data: {
                            siteId: input.siteId,
                            providerAccountId: input.providerAccountId,
                            skuId: sku.id,
                            providerCode: input.providerCode,
                            countryCode,
                            providerResourceId: item.providerResourceId,
                            quantity: item.stock,
                            sourceVersion,
                            capturedAt: input.capturedAt,
                            expiresAt,
                        },
                    });
                }
                snapshots += 1;
            }
            if (mappedThisSku)
                mappedSkus += 1;
        }
        return { snapshots, mappedSkus };
    }
    async reserveAndEnqueue(input) {
        return db_1.prisma.$transaction(async (tx) => {
            await assertScope(tx, input);
            const existing = await tx.stock_reservations.findUnique({
                where: {
                    siteId_tenantId_userId_idempotencyKey: {
                        siteId: input.siteId,
                        tenantId: input.tenantId,
                        userId: input.userId,
                        idempotencyKey: input.idempotencyKey,
                    },
                },
            });
            if (existing)
                return replayExisting(tx, input, existing);
            const now = new Date();
            const snapshot = await tx.dedicated_line_inventory_snapshots.findFirst({
                where: {
                    siteId: input.siteId,
                    providerAccountId: input.providerAccountId,
                    providerCode: input.providerCode,
                    skuId: input.skuId,
                    countryCode: input.countryCode,
                    expiresAt: { gt: now },
                },
                orderBy: [{ capturedAt: 'desc' }, { createdAt: 'desc' }],
            });
            if (!snapshot)
                return insufficient(input, null, 0);
            const claimed = await tx.$executeRaw(client_1.Prisma.sql `
        UPDATE "dedicated_line_inventory_snapshots"
        SET "reservedQuantity" = "reservedQuantity" + ${input.quantity}
        WHERE "id" = ${snapshot.id}
          AND "expiresAt" > ${now}
          AND "quantity" - "reservedQuantity" >= ${input.quantity}
      `);
            if (claimed !== 1) {
                const current = await tx.dedicated_line_inventory_snapshots.findUnique({ where: { id: snapshot.id } });
                return insufficient(input, current?.sourceVersion ?? snapshot.sourceVersion, current ? Math.max(0, current.quantity - current.reservedQuantity) : 0);
            }
            const order = await tx.dedicated_line_orders.create({
                data: {
                    siteId: input.siteId,
                    tenantId: input.tenantId,
                    userId: input.userId,
                    skuId: input.skuId,
                    skuCode: input.orderSnapshot.skuCode.trim(),
                    skuName: input.orderSnapshot.skuName.trim(),
                    countryCode: input.countryCode,
                    regionCode: input.orderSnapshot.regionCode?.trim() || null,
                    businessType: input.orderSnapshot.businessType?.trim() || null,
                    durationDays: input.orderSnapshot.durationDays,
                    quantity: input.quantity,
                    unitPrice: input.orderSnapshot.unitPrice,
                    totalPrice: input.orderSnapshot.totalPrice,
                    currency: input.orderSnapshot.currency.trim().toUpperCase(),
                    priceSource: input.orderSnapshot.priceSource.trim(),
                    contractVersion: input.orderSnapshot.contractVersion,
                    idempotencyKey: input.idempotencyKey,
                },
            });
            const reservation = await tx.stock_reservations.create({
                data: {
                    siteId: input.siteId,
                    tenantId: input.tenantId,
                    userId: input.userId,
                    inventorySnapshotId: snapshot.id,
                    providerAccountId: input.providerAccountId,
                    skuId: input.skuId,
                    dedicatedLineOrderId: order.id,
                    providerCode: input.providerCode,
                    countryCode: input.countryCode,
                    quantity: input.quantity,
                    snapshotVersion: snapshot.sourceVersion,
                    idempotencyKey: input.idempotencyKey,
                    expiresAt: new Date(Math.min(snapshot.expiresAt.getTime(), now.getTime() + RESERVATION_TTL_MS)),
                },
            });
            const wallet = await tx.wallets.findFirst({
                where: { siteId: input.siteId, tenantId: input.tenantId, userId: input.userId },
                select: { id: true },
            });
            if (!wallet)
                throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'wallet_not_found', 404);
            await this.walletRepository.debitWalletTx(tx, wallet.id, input.charge.amount, input.charge.currency.trim().toUpperCase(), 'DEBIT', reservation.id, 'dedicated_line_order', input.charge.idempotencyKey.trim());
            const jobKey = stableKey('dedicated-line-order', input.siteId, input.tenantId, input.userId, input.idempotencyKey);
            const job = await tx.external_jobs.create({
                data: {
                    siteId: input.siteId,
                    tenantId: input.tenantId,
                    userId: input.userId,
                    dedicatedLineOrderId: order.id,
                    kind: PROVIDER_ORDER_JOB_KIND,
                    aggregateType: 'stock_reservation',
                    aggregateId: reservation.id,
                    desiredVersion: 1,
                    idempotencyKey: jobKey,
                    dedupeKey: jobKey,
                    payload: {
                        reservationId: reservation.id,
                        providerCode: input.providerCode,
                        providerAccountId: input.providerAccountId,
                        skuId: input.skuId,
                        countryCode: input.countryCode,
                        quantity: input.quantity,
                        snapshotVersion: snapshot.sourceVersion,
                        request: {
                            ...input.jobPayload,
                            providerResourceId: snapshot.providerResourceId,
                        },
                    },
                },
            });
            return {
                kind: 'RESERVED',
                orderId: order.id,
                reservationId: reservation.id,
                jobId: job.id,
                snapshotId: snapshot.id,
                sourceVersion: snapshot.sourceVersion,
                replayed: false,
            };
        });
    }
    async enqueueInventoryLowAlert(alert) {
        const version = alert.sourceVersion ?? 'missing';
        // outbox_events.aggregateId is non-nullable and the "no usable route" path has no
        // provider account to point at. The namespaced sku fallback keeps the id non-null
        // and impossible to confuse with a real providerAccountId, so the dedupe key stays
        // unchanged for the routed path and distinct for the unrouted one.
        const aggregateId = alert.providerAccountId ?? `sku:${alert.skuId}`;
        const eventKey = stableKey('inventory-low', alert.siteId, aggregateId, alert.skuId, alert.countryCode, version);
        try {
            await db_1.prisma.outbox_events.create({
                data: {
                    siteId: alert.siteId,
                    tenantId: alert.tenantId,
                    userId: alert.userId,
                    topic: bark_alert_outbox_repository_1.BARK_INVENTORY_LOW_TOPIC,
                    aggregateType: 'dedicated_line_inventory',
                    aggregateId,
                    desiredVersion: 1,
                    idempotencyKey: eventKey,
                    dedupeKey: eventKey,
                    payload: {
                        providerCode: alert.providerCode,
                        providerAccountId: alert.providerAccountId,
                        skuId: alert.skuId,
                        countryCode: alert.countryCode,
                        requestedQuantity: alert.requestedQuantity,
                        availableQuantity: alert.availableQuantity,
                        sourceVersion: alert.sourceVersion ?? null,
                    },
                },
            });
        }
        catch (error) {
            if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
                return;
            throw error;
        }
    }
};
exports.DedicatedLineInventoryRepository = DedicatedLineInventoryRepository;
exports.DedicatedLineInventoryRepository = DedicatedLineInventoryRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [wallet_repository_1.WalletRepository])
], DedicatedLineInventoryRepository);
function isDedicatedLineSku(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    return value['delivery'] === 'dedicated-line';
}
async function assertScope(tx, input) {
    const [buyer, sku, providerAccount] = await Promise.all([
        tx.users.findFirst({ where: { id: input.userId, siteId: input.siteId, tenantId: input.tenantId }, select: { id: true } }),
        tx.service_skus.findFirst({
            where: { id: input.skuId, siteId: input.siteId },
            select: { id: true, isActive: true, isVisible: true },
        }),
        tx.provider_accounts.findFirst({
            where: {
                id: input.providerAccountId,
                siteId: input.siteId,
                providerCode: input.providerCode,
                OR: [{ tenantId: null }, { tenantId: input.tenantId }],
            },
            select: { id: true, status: true },
        }),
    ]);
    if (!buyer)
        throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'user_not_found', 404);
    if (!sku)
        throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'sku_not_found', 404);
    if (!sku.isActive || !sku.isVisible)
        throw new app_error_1.AppError(error_codes_1.ErrorCode.PRODUCT_DISABLED, 'sku_not_saleable', 410);
    if (!providerAccount)
        throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'provider_account_not_found', 404);
    if (providerAccount.status !== 'ACTIVE')
        throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_DISABLED, 'provider_disabled', 422);
}
async function replayExisting(tx, input, existing) {
    if (existing.providerAccountId !== input.providerAccountId
        || existing.providerCode !== input.providerCode
        || existing.skuId !== input.skuId
        || existing.countryCode !== input.countryCode
        || existing.quantity !== input.quantity) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.IDEMPOTENCY_CONFLICT, 'dedicated_line_order_idempotency_conflict', 409);
    }
    const job = await tx.external_jobs.findFirst({
        where: {
            siteId: input.siteId,
            aggregateType: 'stock_reservation',
            aggregateId: existing.id,
            kind: PROVIDER_ORDER_JOB_KIND,
        },
        select: { id: true, dedicatedLineOrderId: true },
    });
    if (!job)
        throw new app_error_1.AppError(error_codes_1.ErrorCode.INTERNAL_ERROR, 'dedicated_line_order_job_missing', 500);
    if (!existing.dedicatedLineOrderId || job.dedicatedLineOrderId !== existing.dedicatedLineOrderId) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.INTERNAL_ERROR, 'dedicated_line_order_snapshot_missing', 500);
    }
    const order = await tx.dedicated_line_orders.findUnique({ where: { id: existing.dedicatedLineOrderId } });
    if (!order || !sameOrderSnapshot(order, input)) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.IDEMPOTENCY_CONFLICT, 'dedicated_line_order_idempotency_conflict', 409);
    }
    return {
        kind: 'RESERVED',
        orderId: existing.dedicatedLineOrderId,
        reservationId: existing.id,
        jobId: job.id,
        snapshotId: existing.inventorySnapshotId,
        sourceVersion: existing.snapshotVersion,
        replayed: true,
    };
}
function sameOrderSnapshot(order, input) {
    const snapshot = input.orderSnapshot;
    return order.skuCode === snapshot.skuCode.trim()
        && order.skuName === snapshot.skuName.trim()
        && order.regionCode === (snapshot.regionCode?.trim() || null)
        && order.businessType === (snapshot.businessType?.trim() || null)
        && order.durationDays === snapshot.durationDays
        && order.quantity === input.quantity
        && order.unitPrice.toString() === snapshot.unitPrice
        && order.totalPrice.toString() === snapshot.totalPrice
        && order.currency === snapshot.currency.trim().toUpperCase()
        && order.priceSource === snapshot.priceSource.trim()
        && order.contractVersion === snapshot.contractVersion;
}
function insufficient(input, sourceVersion, availableQuantity) {
    return {
        kind: 'INSUFFICIENT',
        providerCode: input.providerCode,
        providerAccountId: input.providerAccountId,
        skuId: input.skuId,
        countryCode: input.countryCode,
        requestedQuantity: input.quantity,
        availableQuantity,
        sourceVersion,
    };
}
function readInventorySource(value, providerCode) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    const capabilities = value;
    const candidate = capabilities['inventorySource'];
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
        return null;
    const source = candidate;
    if (source['providerCode'] !== providerCode || !Array.isArray(source['providerResourceIds']))
        return null;
    const providerResourceIds = source['providerResourceIds']
        .filter((item) => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim());
    return providerResourceIds.length > 0 ? { providerCode, providerResourceIds } : null;
}
function stableSnapshotVersion(input, skuId, providerResourceIds) {
    return (0, node_crypto_1.createHash)('sha256')
        .update([input.providerAccountId, input.providerCode, skuId, input.capturedAt.toISOString(), ...providerResourceIds].join('\0'))
        .digest('hex');
}
function stableKey(prefix, ...parts) {
    return `${prefix}:${(0, node_crypto_1.createHash)('sha256').update(parts.join('\0')).digest('hex')}`;
}
//# sourceMappingURL=dedicated-line-inventory.repository.js.map