import type { ManagedLineProjectionRequest } from './managed-line-projection.adapter';
export type ManagedLineProjectionSource = {
    desiredVersion: number;
    inboundTag: string;
    protocol: 'VLESS' | 'VMESS' | 'MIXED';
    clientEmail: string;
    clientIdentityCiphertext: string;
    lineStatus: string;
    expiresAt: Date | null;
    quotaBytes: bigint | null;
    uplinkLimitBps: bigint | null;
    downlinkLimitBps: bigint | null;
    maxConnections: number | null;
    ipLimit: number | null;
    endpointCiphertext: string;
    credentialCiphertext: string;
};
export declare function buildManagedLineProjectionRequest(source: ManagedLineProjectionSource, encryptionKey: string): ManagedLineProjectionRequest;
