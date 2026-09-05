import { Prisma } from '@ipeasy/db/generated/client';
export declare const DEDICATED_LINE_PROJECTION_JOB_KIND = "APPLY_DEDICATED_LINE_PROJECTION";
export type DedicatedLineProjectionJob = Prisma.external_jobsGetPayload<Record<string, never>>;
export type DedicatedLineProjectionWork = {
    projectionId: string;
    projectionKey: string;
    desiredVersion: number;
    desiredHash: string;
    nodeId: string;
    nodeStatus: 'ACTIVE' | 'DRAINING' | 'DISABLED';
    nodeBaseUrl: string;
    nodeApiCredentialCiphertext: string;
    inboundTag: string;
    inboundIsActive: boolean;
    inboundControlNodeId: string | null;
    lineStatus: 'PENDING_PAYMENT' | 'QUEUED' | 'PROVISIONING' | 'ACTIVE' | 'DEGRADED' | 'SUSPENDED' | 'EXPIRED' | 'MIGRATING_AWAITING_ROUTE_IMPORT' | 'CANCELLING' | 'CANCELLED' | 'FAILED';
    protocol: 'VLESS' | 'VMESS' | 'MIXED';
    clientEmail: string;
    clientIdentityCiphertext: string;
    expiresAt: Date | null;
    quotaBytes: bigint | null;
    uplinkLimitBps: bigint | null;
    downlinkLimitBps: bigint | null;
    maxConnections: number | null;
    ipLimit: number | null;
    exitStatus: 'AVAILABLE' | 'RESERVED' | 'ASSIGNED' | 'QUARANTINED' | 'EXPIRED' | 'RELEASED';
    migrationId: string | null;
    migrationTargetExit: boolean;
    exitCountryCode: string;
    exitExpiresAt: Date | null;
    endpointCiphertext: string;
    credentialCiphertext: string;
};
export declare class DedicatedLineProjectionRepository {
    findQueued(limit?: number): Promise<Array<Pick<DedicatedLineProjectionJob, 'id'>>>;
    claimRunnableJob(jobId: string, workerId: string, leaseMs?: number): Promise<DedicatedLineProjectionJob | null>;
    recoverExpiredLeases(): Promise<number>;
    loadClaimedWork(job: DedicatedLineProjectionJob, workerId: string): Promise<DedicatedLineProjectionWork>;
    markReady(job: DedicatedLineProjectionJob, workerId: string, observed: {
        projectionId: string;
        observedVersion: number;
        observedHash: string;
        nodeExternalId: string;
    }): Promise<void>;
    markFailed(job: DedicatedLineProjectionJob, workerId: string, code: string, detail: Record<string, unknown>, options: {
        retry: boolean;
    }): Promise<'RETRYING' | 'FAILED' | 'NEEDS_OPERATOR'>;
}
