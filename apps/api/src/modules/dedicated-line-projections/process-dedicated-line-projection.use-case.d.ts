import { ConfigService } from '../../common/config/config.service';
import { DedicatedLineProjectionRepository } from './dedicated-line-projection.repository';
import { ManagedLineProjectionAdapter } from './managed-line-projection.adapter';
export type DedicatedLineProjectionExecutionResult = {
    status: 'NOOP';
    jobId: string;
} | {
    status: 'COMPLETED';
    jobId: string;
    projectionId: string;
    observedVersion: number;
} | {
    status: 'RETRYING' | 'FAILED';
    jobId: string;
    attempts: number;
} | {
    status: 'NEEDS_OPERATOR';
    jobId: string;
    error: string;
};
export declare class ProcessDedicatedLineProjectionUseCase {
    private readonly projections;
    private readonly adapter;
    private readonly config;
    constructor(projections: DedicatedLineProjectionRepository, adapter: ManagedLineProjectionAdapter, config: ConfigService);
    execute(jobId: string, workerId?: string): Promise<DedicatedLineProjectionExecutionResult>;
}
