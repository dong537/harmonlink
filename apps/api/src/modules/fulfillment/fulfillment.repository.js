"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FulfillmentRepository = void 0;
const common_1 = require("@nestjs/common");
const db_1 = require("@ipeasy/db");
const DEFAULT_RUNNING_TIMEOUT_MS = 10 * 60 * 1000;
let FulfillmentRepository = class FulfillmentRepository {
    async createJob(tx, data) {
        return tx.fulfillment_jobs.create({ data });
    }
    async findQueued(limit = 20) {
        return db_1.prisma.fulfillment_jobs.findMany({
            where: { status: { in: ['QUEUED', 'RETRYING'] }, scheduledAt: { lte: new Date() } },
            orderBy: { scheduledAt: 'asc' },
            take: limit,
        });
    }
    async claimRunnableJob(id) {
        const result = await db_1.prisma.fulfillment_jobs.updateMany({
            where: { id, status: { in: ['QUEUED', 'RETRYING'] }, scheduledAt: { lte: new Date() } },
            data: { status: 'RUNNING', startedAt: new Date() },
        });
        if (result.count === 0)
            return null;
        return db_1.prisma.fulfillment_jobs.findUnique({ where: { id } });
    }
    async recoverStaleRunningJobs(timeoutMs = DEFAULT_RUNNING_TIMEOUT_MS) {
        const staleBefore = new Date(Date.now() - timeoutMs);
        const result = await db_1.prisma.fulfillment_jobs.updateMany({
            where: {
                status: 'RUNNING',
                startedAt: { lte: staleBefore },
            },
            data: {
                status: 'RETRYING',
                scheduledAt: new Date(),
                lastError: 'worker_interrupted_recovered',
            },
        });
        return result.count;
    }
    async updateJobStatus(id, status, extra) {
        return db_1.prisma.fulfillment_jobs.update({ where: { id }, data: { status, ...extra } });
    }
};
exports.FulfillmentRepository = FulfillmentRepository;
exports.FulfillmentRepository = FulfillmentRepository = __decorate([
    (0, common_1.Injectable)()
], FulfillmentRepository);
//# sourceMappingURL=fulfillment.repository.js.map