"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpstreamLogRepository = void 0;
exports.redactSensitiveSummary = redactSensitiveSummary;
const common_1 = require("@nestjs/common");
const db_1 = require("@ipeasy/db");
const pagination_dto_1 = require("../../common/pagination/pagination.dto");
const SENSITIVE_KEYS = new Set([
    'apikey',
    'appid',
    'appsecret',
    'authorization',
    'credential',
    'credentialencrypted',
    'password',
    'secret',
    'token',
    'username',
]);
function redactSensitiveSummary(value) {
    if (value === null)
        return null;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (Array.isArray(value)) {
        return value.map((item) => redactSensitiveSummary(item));
    }
    if (typeof value !== 'object') {
        return null;
    }
    const output = {};
    for (const [key, item] of Object.entries(value)) {
        output[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : redactSensitiveSummary(item);
    }
    return output;
}
function jsonSummary(value) {
    return value ? redactSensitiveSummary(value) : undefined;
}
const UPSTREAM_REQUEST_STATUSES = new Set(['SUCCESS', 'ERROR', 'TIMEOUT']);
let UpstreamLogRepository = class UpstreamLogRepository {
    async create(data) {
        await db_1.prisma.upstream_request_logs.create({
            data: {
                siteId: data.siteId,
                providerCode: data.providerCode,
                upstreamAccountId: data.upstreamAccountId,
                operation: data.operation,
                requestId: data.requestId,
                durationMs: data.durationMs,
                status: data.status,
                errorCode: data.errorCode,
                requestSummary: jsonSummary(data.requestSummary),
                responseSummary: jsonSummary(data.responseSummary),
            },
        });
    }
    async listForSite(siteId, query) {
        const { page, pageSize } = (0, pagination_dto_1.normalizePageQuery)(query);
        const where = { siteId };
        if (query.providerCode)
            where.providerCode = query.providerCode;
        if (query.status && UPSTREAM_REQUEST_STATUSES.has(query.status)) {
            where.status = query.status;
        }
        if (query.from || query.to) {
            where.createdAt = {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
            };
        }
        const [total, rows] = await Promise.all([
            db_1.prisma.upstream_request_logs.count({ where }),
            db_1.prisma.upstream_request_logs.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
        ]);
        return {
            page,
            pageSize,
            total,
            items: rows.map((row) => ({
                id: row.id,
                siteId: row.siteId,
                providerCode: row.providerCode,
                upstreamAccountId: row.upstreamAccountId,
                operation: row.operation,
                requestId: row.requestId,
                durationMs: row.durationMs,
                status: row.status,
                errorCode: row.errorCode,
                requestSummary: row.requestSummary ?? null,
                responseSummary: row.responseSummary ?? null,
                createdAt: row.createdAt,
            })),
        };
    }
};
exports.UpstreamLogRepository = UpstreamLogRepository;
exports.UpstreamLogRepository = UpstreamLogRepository = __decorate([
    (0, common_1.Injectable)()
], UpstreamLogRepository);
//# sourceMappingURL=upstream-log.repository.js.map