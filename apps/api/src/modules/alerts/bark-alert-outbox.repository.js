"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BarkAlertOutboxRepository = exports.BARK_ALERT_TOPICS = exports.BARK_INVENTORY_LOW_TOPIC = void 0;
const common_1 = require("@nestjs/common");
const db_1 = require("@ipeasy/db");
const client_1 = require("@ipeasy/db/generated/client");
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
const domain_1 = require("../external-work/domain");
exports.BARK_INVENTORY_LOW_TOPIC = 'alerts.bark.inventory_low';
exports.BARK_ALERT_TOPICS = [exports.BARK_INVENTORY_LOW_TOPIC];
let BarkAlertOutboxRepository = class BarkAlertOutboxRepository {
    async findQueued(limit = 20) {
        const now = new Date();
        return db_1.prisma.outbox_events.findMany({
            where: {
                topic: { in: [...exports.BARK_ALERT_TOPICS] },
                status: { in: ['PENDING', 'RETRYING'] },
                nextRunAt: { lte: now },
                OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
            },
            orderBy: [{ nextRunAt: 'asc' }, { createdAt: 'asc' }],
            take: limit,
            select: { id: true },
        });
    }
    async claimRunnableEvent(eventId, workerId, leaseMs = 60_000) {
        return db_1.prisma.$transaction(async (tx) => {
            const now = new Date();
            const claimed = await tx.outbox_events.updateMany({
                where: {
                    id: eventId,
                    topic: { in: [...exports.BARK_ALERT_TOPICS] },
                    status: { in: ['PENDING', 'RETRYING'] },
                    nextRunAt: { lte: now },
                    OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
                },
                data: {
                    status: 'LEASED',
                    attempt: { increment: 1 },
                    leaseOwner: workerId,
                    leaseExpiresAt: new Date(now.getTime() + leaseMs),
                },
            });
            if (claimed.count !== 1)
                return null;
            return tx.outbox_events.findUniqueOrThrow({ where: { id: eventId } });
        });
    }
    async recoverExpiredLeases() {
        // A lease expires after the event was claimed, so the Bark push may already have
        // reached the admin devices. Retrying would duplicate the alert, so transmission
        // ambiguity goes to operator review instead of back into the queue.
        const recovered = await db_1.prisma.outbox_events.updateMany({
            where: {
                topic: { in: [...exports.BARK_ALERT_TOPICS] },
                status: 'LEASED',
                leaseExpiresAt: { lt: new Date() },
            },
            data: {
                status: 'NEEDS_OPERATOR',
                leaseOwner: null,
                leaseExpiresAt: null,
                lastErrorCode: 'BARK_DELIVERY_LEASE_EXPIRED',
                lastErrorDetail: { reasonKey: 'bark_delivery_lease_expired' },
            },
        });
        return recovered.count;
    }
    async markPublished(event, workerId) {
        const now = new Date();
        const updated = await db_1.prisma.outbox_events.updateMany({
            where: activeLeaseWhere(event, workerId, now),
            data: {
                status: 'PUBLISHED',
                publishedAt: now,
                leaseOwner: null,
                leaseExpiresAt: null,
                lastErrorCode: null,
                lastErrorDetail: client_1.Prisma.JsonNull,
            },
        });
        if (updated.count !== 1)
            staleBarkAlertLease();
    }
    async releaseClaimed(event, workerId) {
        const now = new Date();
        const updated = await db_1.prisma.outbox_events.updateMany({
            where: activeLeaseWhere(event, workerId, now),
            data: {
                status: 'PENDING',
                attempt: { decrement: 1 },
                nextRunAt: new Date(now.getTime() + 5_000),
                leaseOwner: null,
                leaseExpiresAt: null,
            },
        });
        if (updated.count !== 1)
            staleBarkAlertLease();
    }
    async markFailed(event, workerId, code, detail, options) {
        return db_1.prisma.$transaction(async (tx) => {
            const current = await tx.outbox_events.findUnique({ where: { id: event.id } });
            if (!current)
                throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'bark_alert_event_not_found', 404);
            (0, domain_1.assertLeaseCompletion)(current, {
                workerId,
                desiredVersion: event.desiredVersion,
                now: new Date(),
                onStale: staleBarkAlertLease,
            });
            const status = options.retry
                ? (current.attempt >= current.maxAttempts ? 'FAILED' : 'RETRYING')
                : 'NEEDS_OPERATOR';
            const now = new Date();
            const updated = await tx.outbox_events.updateMany({
                where: activeLeaseWhere(current, workerId, now),
                data: {
                    status,
                    nextRunAt: status === 'RETRYING' ? new Date(now.getTime() + retryDelayMs(current.attempt)) : current.nextRunAt,
                    leaseOwner: null,
                    leaseExpiresAt: null,
                    lastErrorCode: code,
                    lastErrorDetail: detail,
                },
            });
            if (updated.count !== 1)
                staleBarkAlertLease();
            return status;
        });
    }
};
exports.BarkAlertOutboxRepository = BarkAlertOutboxRepository;
exports.BarkAlertOutboxRepository = BarkAlertOutboxRepository = __decorate([
    (0, common_1.Injectable)()
], BarkAlertOutboxRepository);
function activeLeaseWhere(event, workerId, now) {
    return {
        id: event.id,
        desiredVersion: event.desiredVersion,
        status: 'LEASED',
        leaseOwner: workerId,
        leaseExpiresAt: { gt: now },
    };
}
function staleBarkAlertLease() {
    throw new app_error_1.AppError(error_codes_1.ErrorCode.IDEMPOTENCY_CONFLICT, 'bark_alert_lease_stale', 409);
}
function retryDelayMs(attempt) {
    return Math.min(60_000, Math.max(1_000, 2 ** Math.min(attempt, 6) * 1_000));
}
//# sourceMappingURL=bark-alert-outbox.repository.js.map