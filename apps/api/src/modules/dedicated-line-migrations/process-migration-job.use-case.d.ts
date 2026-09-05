import { ManagedLineProjectionAdapter } from '../dedicated-line-projections/managed-line-projection.adapter';
import { DedicatedLineMigrationJobRepository } from './dedicated-line-migration-job.repository';
import { ProcessMigrationCleanupUseCase } from './process-migration-cleanup.use-case';
import { ProcessMigrationSmokeUseCase } from './process-migration-smoke.use-case';
export type DedicatedLineMigrationExecutionResult = {
    status: 'NOOP' | 'COMPLETED' | 'WAITING';
    jobId: string;
} | {
    status: 'RETRYING' | 'FAILED';
    jobId: string;
    attempts: number;
} | {
    status: 'NEEDS_OPERATOR';
    jobId: string;
    error: string;
};
export declare class ProcessMigrationJobUseCase {
    private readonly jobs;
    private readonly projectionAdapter;
    private readonly smoke;
    private readonly cleanup;
    constructor(jobs: DedicatedLineMigrationJobRepository, projectionAdapter: ManagedLineProjectionAdapter, smoke: ProcessMigrationSmokeUseCase, cleanup: ProcessMigrationCleanupUseCase);
    execute(jobId: string, workerId?: string): Promise<DedicatedLineMigrationExecutionResult>;
    private defer;
    private fail;
}
