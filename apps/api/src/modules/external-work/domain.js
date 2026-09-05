"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isClaimableExternalWork = isClaimableExternalWork;
exports.assertLeaseCompletion = assertLeaseCompletion;
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
function isClaimableExternalWork(work, now) {
    if (work.status !== 'QUEUED' && work.status !== 'RETRYING')
        return false;
    if (work.nextRunAt.getTime() > now.getTime())
        return false;
    return work.leaseExpiresAt === null || work.leaseExpiresAt.getTime() <= now.getTime();
}
function assertLeaseCompletion(job, context) {
    if (job.leaseOwner !== context.workerId) {
        if (context.onStale)
            context.onStale();
        throw new app_error_1.AppError(error_codes_1.ErrorCode.IDEMPOTENCY_CONFLICT, 'external_work_lease_owner_mismatch', 409);
    }
    if (job.leaseExpiresAt === null || job.leaseExpiresAt.getTime() <= context.now.getTime()) {
        if (context.onStale)
            context.onStale();
        throw new app_error_1.AppError(error_codes_1.ErrorCode.IDEMPOTENCY_CONFLICT, 'external_work_lease_expired', 409);
    }
    if (job.desiredVersion !== context.desiredVersion) {
        if (context.onStale)
            context.onStale();
        throw new app_error_1.AppError(error_codes_1.ErrorCode.IDEMPOTENCY_CONFLICT, 'external_work_desired_version_stale', 409);
    }
}
//# sourceMappingURL=domain.js.map