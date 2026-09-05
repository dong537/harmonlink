import { UpstreamRequestStatus } from './provider.types';
import { PageQueryDto, PageResult } from '../../common/pagination/pagination.dto';
export type JsonSummary = string | number | boolean | null | JsonSummary[] | {
    [key: string]: JsonSummary;
};
export interface CreateUpstreamLogInput {
    siteId: string;
    providerCode: string;
    upstreamAccountId?: string;
    operation: string;
    requestId: string;
    durationMs: number;
    status: UpstreamRequestStatus;
    errorCode?: string;
    requestSummary?: Record<string, unknown>;
    responseSummary?: Record<string, unknown>;
}
export interface UpstreamLogListItem {
    id: string;
    siteId: string;
    providerCode: string;
    upstreamAccountId: string | null;
    operation: string;
    requestId: string;
    durationMs: number;
    status: UpstreamRequestStatus;
    errorCode: string | null;
    requestSummary: JsonSummary | null;
    responseSummary: JsonSummary | null;
    createdAt: Date;
}
export interface ListUpstreamLogsQuery extends PageQueryDto {
    providerCode?: string;
    status?: string;
}
export declare function redactSensitiveSummary(value: unknown): JsonSummary;
export declare class UpstreamLogRepository {
    create(data: CreateUpstreamLogInput): Promise<void>;
    listForSite(siteId: string, query: ListUpstreamLogsQuery): Promise<PageResult<UpstreamLogListItem>>;
}
