import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';

export type ExternalWorkStatus = 'QUEUED' | 'LEASED' | 'RETRYING' | 'COMPLETED' | 'FAILED' | 'NEEDS_OPERATOR';

export interface ClaimableExternalWork {
  status: ExternalWorkStatus;
  nextRunAt: Date;
  leaseExpiresAt: Date | null;
}

export function isClaimableExternalWork(work: ClaimableExternalWork, now: Date): boolean {
  if (work.status !== 'QUEUED' && work.status !== 'RETRYING') return false;
  if (work.nextRunAt.getTime() > now.getTime()) return false;
  return work.leaseExpiresAt === null || work.leaseExpiresAt.getTime() <= now.getTime();
}

export type LeasedJob = {
  desiredVersion: number;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
};

/**
 * `onStale` lets a caller replace the generic conflict with its own domain
 * error (the dedicated-line order repository routes stale leases to an
 * operator queue rather than retrying). Callers that omit it get the
 * distinguishable default reasonKeys below.
 */
export interface LeaseCompletionContext {
  workerId: string;
  desiredVersion: number;
  now: Date;
  onStale?: () => never;
}

export function assertLeaseCompletion(job: LeasedJob, context: LeaseCompletionContext): void {
  if (job.leaseOwner !== context.workerId) {
    if (context.onStale) context.onStale();
    throw new AppError(ErrorCode.IDEMPOTENCY_CONFLICT, 'external_work_lease_owner_mismatch', 409);
  }
  if (job.leaseExpiresAt === null || job.leaseExpiresAt.getTime() <= context.now.getTime()) {
    if (context.onStale) context.onStale();
    throw new AppError(ErrorCode.IDEMPOTENCY_CONFLICT, 'external_work_lease_expired', 409);
  }
  if (job.desiredVersion !== context.desiredVersion) {
    if (context.onStale) context.onStale();
    throw new AppError(ErrorCode.IDEMPOTENCY_CONFLICT, 'external_work_desired_version_stale', 409);
  }
}
