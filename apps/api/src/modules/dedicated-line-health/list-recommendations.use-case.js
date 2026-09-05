"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ListDedicatedLineRecommendationsUseCase = void 0;
const common_1 = require("@nestjs/common");
const db_1 = require("@ipeasy/db");
const auth_context_1 = require("../../common/auth/auth-context");
let ListDedicatedLineRecommendationsUseCase = class ListDedicatedLineRecommendationsUseCase {
    async execute(ctx) {
        (0, auth_context_1.requireOperatorContext)(ctx);
        return db_1.prisma.dedicated_line_migration_recommendations.findMany({
            where: { siteId: ctx.siteId, status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
            include: { sourceNode: { select: { id: true, code: true, regionCode: true } }, dedicatedLine: { select: { id: true, countryCode: true, status: true, desiredVersion: true } }, candidates: { orderBy: { rank: 'asc' }, include: { node: { select: { id: true, code: true, regionCode: true, status: true, allocatedUnits: true, capacityUnits: true } } } } },
        });
    }
};
exports.ListDedicatedLineRecommendationsUseCase = ListDedicatedLineRecommendationsUseCase;
exports.ListDedicatedLineRecommendationsUseCase = ListDedicatedLineRecommendationsUseCase = __decorate([
    (0, common_1.Injectable)()
], ListDedicatedLineRecommendationsUseCase);
//# sourceMappingURL=list-recommendations.use-case.js.map