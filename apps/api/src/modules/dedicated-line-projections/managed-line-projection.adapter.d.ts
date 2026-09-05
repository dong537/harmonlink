import { ConfigService } from '../../common/config/config.service';
export type ManagedLineProjectionNode = {
    baseUrl: string;
    apiCredentialCiphertext: string;
};
export type ManagedLineProjectionRequest = {
    desiredVersion: number;
    inboundTag: string;
    protocol: 'VLESS' | 'VMESS' | 'MIXED';
    client: {
        email: string;
        id?: string;
        flow?: string;
        user?: string;
        password?: string;
    };
    egress: {
        host: string;
        port: number;
        username: string;
        password: string;
    };
    lifecycle: {
        enabled: boolean;
        expiresAtMs: number;
        trafficLimitBytes: number;
        ipLimit: number;
        uplinkLimitBps: number;
        downlinkLimitBps: number;
        maxConnections: number;
    };
};
export type ManagedLineProjectionResponse = {
    projectionKey: string;
    desiredVersion: number;
    observedVersion: number;
    desiredHash: string;
    observedHash: string;
    inboundId: number;
    inboundTag: string;
    protocol: string;
    clientEmail: string;
    outboundTag: string;
    ruleTag: string;
    status: string;
    lastErrorCode?: string;
    lastErrorDetail?: string;
    lastAppliedAt: number;
    lastObservedAt: number;
};
type FetchLike = typeof fetch;
export declare class ManagedLineProjectionAdapter {
    private readonly config;
    private readonly fetchImpl;
    constructor(config: ConfigService, fetchImpl?: FetchLike);
    upsert(node: ManagedLineProjectionNode, projectionKey: string, request: ManagedLineProjectionRequest): Promise<ManagedLineProjectionResponse>;
    get(node: ManagedLineProjectionNode, projectionKey: string): Promise<ManagedLineProjectionResponse>;
    delete(node: ManagedLineProjectionNode, projectionKey: string, desiredVersion: number): Promise<void>;
    private request;
    private decryptToken;
}
export {};
