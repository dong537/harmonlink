import { Prisma } from '@ipeasy/db/generated/client';
import { WalletRepository } from '../wallet/wallet.repository';
export type DedicatedLineOrderJob = Prisma.external_jobsGetPayload<Record<string, never>>;
export type PersistDedicatedLineOrderInput = {
    jobId: string;
    workerId: string;
    desiredVersion: number;
    reservationId: string;
    providerCode: string;
    providerAccountId: string;
    skuId: string;
    countryCode: string;
    placementPolicyId: string;
    inboundTag: string;
    exits: Array<{
        lineId: string;
        inboundProfileId: string;
        protocol: 'VLESS' | 'VMESS' | 'MIXED';
        clientEmail: string;
        clientIdentityCiphertext: string;
        clientIdentityFingerprint: string;
        projectionDesiredHash: string;
        providerProxyId: string | null;
        endpointCiphertext: string;
        credentialCiphertext: string;
        identityFingerprint: string;
        maxReplicaFanout: number;
        expiresAt: Date;
    }>;
};
export declare class DedicatedLineOrderRepository {
    private readonly walletRepository;
    constructor(walletRepository: WalletRepository);
    findQueued(limit?: number): Promise<Array<Pick<DedicatedLineOrderJob, 'id'>>>;
    claimRunnableJob(jobId: string, workerId: string, leaseMs?: number): Promise<DedicatedLineOrderJob | null>;
    recoverExpiredLeases(): Promise<number>;
    saveUpstreamOrderId(job: DedicatedLineOrderJob, workerId: string, upstreamOrderId: string, retryAt: Date): Promise<void>;
    persistCompletedOrder(input: PersistDedicatedLineOrderInput): Promise<{
        status: 'COMPLETED';
    } | {
        status: 'NEEDS_OPERATOR';
        reasonKey: string;
    }>;
    markFailed(job: DedicatedLineOrderJob, workerId: string, code: string, detail: Record<string, unknown>, options: {
        retry: boolean;
        releaseReservation: boolean;
    }): Promise<'RETRYING' | 'FAILED' | 'NEEDS_OPERATOR'>;
    releaseReservation(job: DedicatedLineOrderJob): Promise<void>;
}
export declare function releaseReservationTx(tx: Prisma.TransactionClient, reservationId: string, terminalStatus?: 'RELEASED' | 'EXPIRED', releasedAt?: Date): Promise<boolean>;
export declare function refundReservationTx(tx: Prisma.TransactionClient, reservationId: string, walletRepository: WalletRepository): Promise<void>;
export declare function exitIdentityFingerprint(siteId: string, providerCode: string, providerAccountId: string, providerProxyId: string | null, ip: string, port: number): string;
