import { ProviderRegistryService } from '../providers/provider-registry.service';
import { ConfigService } from '../../common/config/config.service';
import { DedicatedLineOrderJob, DedicatedLineOrderRepository } from './dedicated-line-order.repository';
import type { DedicatedLineOrderRequest } from './domain';
export type DedicatedLineOrderExecutionResult = {
    status: 'NOOP';
    jobId: string;
} | {
    status: 'COMPLETED';
    jobId: string;
    reservationId: string;
    exits: number;
} | {
    status: 'RETRYING';
    jobId: string;
    attempts: number;
    upstreamOrderId: string;
} | {
    status: 'NEEDS_OPERATOR';
    jobId: string;
    error: string;
};
export declare class ProcessDedicatedLineOrderUseCase {
    private readonly jobs;
    private readonly providers;
    private readonly config;
    constructor(jobs: DedicatedLineOrderRepository, providers: ProviderRegistryService, config: ConfigService);
    execute(jobId: string, workerId?: string): Promise<DedicatedLineOrderExecutionResult>;
}
export declare function parseRequest(payload: DedicatedLineOrderJob): DedicatedLineOrderRequest;
