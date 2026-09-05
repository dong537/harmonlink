export type ExternalWorkStatus = 'QUEUED' | 'LEASED' | 'RETRYING' | 'COMPLETED' | 'FAILED' | 'NEEDS_OPERATOR';
export interface ClaimableExternalWork {
    status: ExternalWorkStatus;
    nextRunAt: Date;
    leaseExpiresAt: Date | null;
}
export declare function isClaimableExternalWork(work: ClaimableExternalWork, now: Date): boolean;
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
export declare function assertLeaseCompletion(job: LeasedJob, context: LeaseCompletionContext): void;
