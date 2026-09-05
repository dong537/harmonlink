"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiKeysRepository = void 0;
const common_1 = require("@nestjs/common");
const db_1 = require("@ipeasy/db");
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
const pagination_dto_1 = require("../../common/pagination/pagination.dto");
let ApiKeysRepository = class ApiKeysRepository {
    async findByKeyHash(keyHash) {
        return db_1.prisma.api_keys.findUnique({ where: { keyHash } });
    }
    async findById(id) {
        const key = await db_1.prisma.api_keys.findUnique({ where: { id } });
        if (!key)
            throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'api_key_not_found', 404);
        return key;
    }
    async listForOwner(owner, query) {
        const { page, pageSize } = (0, pagination_dto_1.normalizePageQuery)(query);
        const where = {
            ownerId: owner.ownerId,
            siteId: owner.siteId,
            tenantId: owner.tenantId,
        };
        const [total, items] = await Promise.all([
            db_1.prisma.api_keys.count({ where }),
            db_1.prisma.api_keys.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
        ]);
        return { page, pageSize, total, items };
    }
    async create(data) {
        return db_1.prisma.api_keys.create({ data: { ...data, status: 'ACTIVE' } });
    }
    async revoke(id) {
        await db_1.prisma.api_keys.update({
            where: { id },
            data: { status: 'REVOKED', revokedAt: new Date() },
        });
    }
    async updateLastUsed(id) {
        await db_1.prisma.api_keys.update({
            where: { id },
            data: { lastUsedAt: new Date() },
        });
    }
};
exports.ApiKeysRepository = ApiKeysRepository;
exports.ApiKeysRepository = ApiKeysRepository = __decorate([
    (0, common_1.Injectable)()
], ApiKeysRepository);
//# sourceMappingURL=api-keys.repository.js.map