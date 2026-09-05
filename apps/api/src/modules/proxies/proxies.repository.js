"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProxiesRepository = void 0;
const common_1 = require("@nestjs/common");
const db_1 = require("@ipeasy/db");
const pagination_dto_1 = require("../../common/pagination/pagination.dto");
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
let ProxiesRepository = class ProxiesRepository {
    async createMany(tx, data) {
        await tx.proxy_instances.createMany({ data });
    }
    async findByUserId(userId, siteId, tenantId, query) {
        const { page, pageSize } = (0, pagination_dto_1.normalizePageQuery)(query);
        const where = { userId, siteId, tenantId };
        applyProxyFilters(where, query, 'USER');
        const [total, items] = await Promise.all([
            db_1.prisma.proxy_instances.count({ where }),
            db_1.prisma.proxy_instances.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
        ]);
        return { page, pageSize, total, items };
    }
    async listForAdmin(siteId, tenantId, query) {
        const { page, pageSize } = (0, pagination_dto_1.normalizePageQuery)(query);
        const where = { siteId };
        if (tenantId)
            where.tenantId = tenantId;
        applyProxyFilters(where, query, 'ADMIN');
        const [total, items] = await Promise.all([
            db_1.prisma.proxy_instances.count({ where }),
            db_1.prisma.proxy_instances.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
        ]);
        return { page, pageSize, total, items };
    }
    async findById(id) {
        return db_1.prisma.proxy_instances.findUnique({ where: { id } });
    }
    async findByOrderId(orderId, userId, tenantId) {
        return db_1.prisma.proxy_instances.findMany({
            where: { orderId, userId, tenantId },
            orderBy: { createdAt: 'asc' },
        });
    }
    async updateStatus(id, status) {
        return db_1.prisma.proxy_instances.update({ where: { id }, data: { status } });
    }
    async findAllActiveByUserId(userId, siteId, tenantId) {
        return db_1.prisma.proxy_instances.findMany({
            where: { userId, siteId, tenantId, status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
        });
    }
};
exports.ProxiesRepository = ProxiesRepository;
exports.ProxiesRepository = ProxiesRepository = __decorate([
    (0, common_1.Injectable)()
], ProxiesRepository);
function applyProxyFilters(where, query, scope) {
    if (query.status)
        where.status = query.status;
    if (query.countryCode)
        where.countryCode = query.countryCode;
    if (scope === 'ADMIN' && query.orderId)
        where.orderId = query.orderId;
    if (scope === 'ADMIN' && query.userId)
        where.userId = query.userId;
    const expiresAt = dateRange(query.from, query.to);
    if (expiresAt)
        where.expiresAt = expiresAt;
    if (query.search) {
        const contains = { contains: query.search, mode: 'insensitive' };
        where.OR = [
            { ip: contains },
            { orderId: contains },
            { upstreamProxyId: contains },
            { countryCode: contains },
            ...(scope === 'ADMIN' ? [{ userId: contains }] : []),
        ];
    }
}
function dateRange(from, to) {
    const range = {};
    if (from)
        range.gte = parseDate(from, 'from_invalid');
    if (to)
        range.lte = parseDate(to, 'to_invalid');
    return Object.keys(range).length > 0 ? range : undefined;
}
function parseDate(value, reasonKey) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, reasonKey, 400);
    }
    return date;
}
//# sourceMappingURL=proxies.repository.js.map