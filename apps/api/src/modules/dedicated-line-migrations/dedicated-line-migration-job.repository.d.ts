import { Prisma } from '@ipeasy/db/generated/client';
export declare const MIGRATION_JOB_KINDS: readonly ["VERIFY_DEDICATED_LINE_MIGRATION", "DELETE_DEDICATED_LINE_PROJECTION", "CLEANUP_DEDICATED_LINE_MIGRATION"];
export type DedicatedLineMigrationJobKind = typeof MIGRATION_JOB_KINDS[number];
export type DedicatedLineMigrationJob = Prisma.external_jobsGetPayload<Record<string, never>>;
export type ProjectionDeleteWork = {
    projectionId: string;
    projectionKey: string;
    desiredVersion: number;
    nodeBaseUrl: string;
    nodeApiCredentialCiphertext: string;
};
export declare class DedicatedLineMigrationJobRepository {
    enqueueRunnableJobs(limit?: number): Promise<number>;
    findQueued(limit?: number): Promise<Array<Pick<DedicatedLineMigrationJob, 'id'>>>;
    claimRunnableJob(jobId: string, workerId: string, leaseMs?: number): Promise<DedicatedLineMigrationJob | null>;
    recoverExpiredLeases(): Promise<number>;
    loadProjectionDeleteWork(job: DedicatedLineMigrationJob, workerId: string): Promise<ProjectionDeleteWork | null>;
    markCompleted(job: DedicatedLineMigrationJob, workerId: string): Promise<void>;
    deferClaimed(job: DedicatedLineMigrationJob, workerId: string): Promise<void>;
    markFailed(job: DedicatedLineMigrationJob, workerId: string, code: string, detail: Record<string, unknown>, options: {
        retry: boolean;
    }): Promise<'RETRYING' | 'FAILED' | 'NEEDS_OPERATOR'>;
    private enqueueMigrationJob;
    private enqueueProjectionDeleteJob;
}
