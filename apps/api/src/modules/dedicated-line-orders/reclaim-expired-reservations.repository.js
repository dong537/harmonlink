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
exports.ReclaimExpiredReservationsRepository = void 0;
const common_1 = require("@nestjs/common");
const db_1 = require("@ipeasy/db");
const wallet_repository_1 = require("../wallet/wallet.repository");
const dedicated_line_order_repository_1 = require("./dedicated-line-order.repository");
const ORDER_JOB_KIND = 'PROVIDER_DEDICATED_LINE_ORDER';
let ReclaimExpiredReservationsRepository = class ReclaimExpiredReservationsRepository {
    wallets;
    constructor(wallets) {
        this.wallets = wallets;
    }
    // Candidates are reservations whose purchase job was never executed. `attempt`
    // is incremented by claimRunnableJob, and a crashed worker leaves the job in
    // NEEDS_OPERATOR rather than back in QUEUED, so `attempt = 0 AND status =
    // QUEUED` proves the upstream provider was never contacted for this order.
    async findExpiredCandidates(now, limit) {
        const rows = await db_1.prisma.stock_reservations.findMany({
            where: {
                status: 'ACTIVE',
                expiresAt: { lte: now },
            },
            select: { id: true, siteId: true, quantity: true, expiresAt: true },
            orderBy: { expiresAt: 'asc' },
            take: limit,
        });
        if (rows.length === 0)
            return [];
        const jobs = await db_1.prisma.external_jobs.findMany({
            where: {
                kind: ORDER_JOB_KIND,
                aggregateType: 'stock_reservation',
                aggregateId: { in: rows.map((row) => row.id) },
            },
            select: { id: true, siteId: true, aggregateId: true, attempt: true, status: true },
        });
        const jobByReservation = new Map(jobs.map((job) => [job.aggregateId, job]));
        return rows.map((row) => {
            const job = jobByReservation.get(row.id);
            return {
                reservationId: row.id,
                siteId: row.siteId,
                quantity: row.quantity,
                jobId: job?.id ?? null,
                // A missing job is never reclaimable: without it we cannot prove the
                // upstream provider was not contacted.
                neverIssued: job ? job.attempt === 0 && job.status === 'QUEUED' && job.siteId === row.siteId : false,
            };
        });
    }
    // Single transaction so the reservation status, the inventory counter, the
    // refund and the job terminal state can never diverge. Stock is returned
    // through releaseReservationTx, the sole owner of the reservedQuantity
    // counter; its ACTIVE guard makes a concurrent worker release or a real
    // delivery win instead of double-releasing stock or double-refunding.
    async reclaim(candidate, now) {
        return db_1.prisma.$transaction(async (tx) => {
            const released = await (0, dedicated_line_order_repository_1.releaseReservationTx)(tx, candidate.reservationId, 'EXPIRED', now);
            if (!released)
                return false;
            await (0, dedicated_line_order_repository_1.refundReservationTx)(tx, candidate.reservationId, this.wallets);
            if (candidate.jobId) {
                await tx.external_jobs.updateMany({
                    where: { id: candidate.jobId, siteId: candidate.siteId, status: 'QUEUED', attempt: 0 },
                    data: {
                        status: 'FAILED',
                        completedAt: now,
                        lastErrorCode: 'STOCK_RESERVATION_EXPIRED',
                        lastErrorDetail: { reason: 'stock_reservation_expired_before_execution' },
                    },
                });
            }
            return true;
        });
    }
};
exports.ReclaimExpiredReservationsRepository = ReclaimExpiredReservationsRepository;
exports.ReclaimExpiredReservationsRepository = ReclaimExpiredReservationsRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [wallet_repository_1.WalletRepository])
], ReclaimExpiredReservationsRepository);
//# sourceMappingURL=reclaim-expired-reservations.repository.js.map