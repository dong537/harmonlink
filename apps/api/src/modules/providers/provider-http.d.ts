import { ProviderRuntimeConfig, UpstreamRequestStatus } from './provider.types';
import { UpstreamLogRepository } from './upstream-log.repository';
export declare function fetchWithTimeout(url: string, opts: RequestInit, timeoutMs: number, fetchImpl?: typeof fetch): Promise<Response>;
export declare function assertProviderActive(config: ProviderRuntimeConfig): void;
export declare function upstreamUrl(baseUrl: string, path: string): string;
interface RecordUpstreamRequestInput<T> {
    logRepo?: UpstreamLogRepository;
    config: ProviderRuntimeConfig;
    operation: string;
    requestSummary?: Record<string, unknown>;
    run: () => Promise<{
        value: T;
        status?: UpstreamRequestStatus;
        errorCode?: string;
        responseSummary?: Record<string, unknown>;
    }>;
}
export declare function recordUpstreamRequest<T>(input: RecordUpstreamRequestInput<T>): Promise<T>;
export {};
