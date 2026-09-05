"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletRepository = void 0;
const common_1 = require("@nestjs/common");
const db_1 = require("@ipeasy/db");
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
const money_1 = require("../../common/money/money");
const domain_1 = require("./domain");
const pagination_dto_1 = require("../../common/pagination/pagination.dto");
let WalletRepository = class WalletRepository {
    async getWalletByUserId(userId, siteId, tenantId) {
        const where = { userId, siteId };
        if (tenantId)
            where.tenantId = tenantId;
        const wallet = await db_1.prisma.wallets.findFirst({ where });
        if (!wallet)
            throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'wallet_not_found', 404);
        return wallet;
    }
    async listLedgerEntries(walletId, tenantId, query) {
        const { page, pageSize } = (0, pagination_dto_1.normalizePageQuery)(query);
        const where = { walletId, tenantId };
        if (query.type)
            where.type = query.type;
        if (query.from || query.to) {
            where.createdAt = {};
            if (query.from)
                where.createdAt.gte = new Date(query.from);
            if (query.to)
                where.createdAt.lte = new Date(query.to);
        }
        const [total, items] = await Promise.all([
            db_1.prisma.ledger_entries.count({ where }),
            db_1.prisma.ledger_entries.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
        ]);
        return { page, pageSize, total, items };
    }
    async creditWalletTx(tx, walletId, amount, currency, type, relatedId, reason, idempotencyKey) {
        const wallet = await tx.wallets.findUnique({ where: { id: walletId } });
        if (!wallet)
            throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'wallet_not_found', 404);
        if (wallet.currency !== currency) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.CURRENCY_NOT_SUPPORTED, 'currency_mismatch', 422, `Expected ${wallet.currency}, got ${currency}`);
        }
        const existing = await tx.ledger_entries.findUnique({ where: { idempotencyKey } });
        if (existing) {
            if (existing.walletId !== walletId ||
                existing.type !== type ||
                existing.relatedId !== relatedId ||
                existing.currency !== currency ||
                existing.amount.toString() !== (0, money_1.toDecimalString)(amount)) {
                throw new app_error_1.AppError(error_codes_1.ErrorCode.IDEMPOTENCY_CONFLICT, 'ledger_idempotency_conflict', 409);
            }
            return existing;
        }
        const newAvailable = (0, money_1.addMoney)(wallet.available.toString(), amount);
        const updated = await tx.wallets.updateMany({
            where: { id: walletId, version: wallet.version },
            data: { available: newAvailable, version: { increment: 1 } },
        });
        if (updated.count === 0) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'wallet_concurrent_update', 409);
        }
        return tx.ledger_entries.create({
            data: {
                siteId: wallet.siteId,
                tenantId: wallet.tenantId,
                walletId,
                userId: wallet.userId,
                type,
                amount,
                balanceAfter: newAvailable,
                currency,
                relatedId,
                reason,
                idempotencyKey,
            },
        });
    }
    async debitWalletTx(tx, walletId, amount, currency, type, relatedId, reason, idempotencyKey) {
        const wallet = await tx.wallets.findUnique({ where: { id: walletId } });
        if (!wallet)
            throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'wallet_not_found', 404);
        if (wallet.currency !== currency) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.CURRENCY_NOT_SUPPORTED, 'currency_mismatch', 422, `Expected ${wallet.currency}, got ${currency}`);
        }
        const existing = await tx.ledger_entries.findUnique({ where: { idempotencyKey } });
        const ledgerAmount = (0, money_1.toDecimalString)(`-${amount}`);
        if (existing) {
            if (existing.walletId !== walletId ||
                existing.type !== type ||
                existing.relatedId !== relatedId ||
                existing.currency !== currency ||
                existing.amount.toString() !== ledgerAmount) {
                throw new app_error_1.AppError(error_codes_1.ErrorCode.IDEMPOTENCY_CONFLICT, 'ledger_idempotency_conflict', 409);
            }
            return existing;
        }
        (0, domain_1.assertSufficientBalance)(wallet.available.toString(), amount);
        const newAvailable = (0, money_1.subtractMoney)(wallet.available.toString(), amount);
        const updated = await tx.wallets.updateMany({
            where: { id: walletId, version: wallet.version, available: { gte: amount } },
            data: { available: newAvailable, version: { increment: 1 } },
        });
        if (updated.count === 0) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'wallet_concurrent_update', 409);
        }
        return tx.ledger_entries.create({
            data: {
                siteId: wallet.siteId,
                tenantId: wallet.tenantId,
                walletId,
                userId: wallet.userId,
                type,
                amount: ledgerAmount,
                balanceAfter: newAvailable,
                currency,
                relatedId,
                reason,
                idempotencyKey,
            },
        });
    }
};
exports.WalletRepository = WalletRepository;
exports.WalletRepository = WalletRepository = __decorate([
    (0, common_1.Injectable)()
], WalletRepository);
//# sourceMappingURL=wallet.repository.js.map