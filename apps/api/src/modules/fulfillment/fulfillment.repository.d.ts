import { prisma, Prisma, FulfillmentJobStatus } from '@ipeasy/db';
export type FulfillmentJob = Prisma.fulfillment_jobsGetPayload<Record<string, never>>;
type PrismaTransactionClient = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;
export declare class FulfillmentRepository {
    createJob(tx: PrismaTransactionClient, data: Prisma.fulfillment_jobsCreateInput): Promise<FulfillmentJob>;
    findQueued(limit?: number): Promise<FulfillmentJob[]>;
    claimRunnableJob(id: string): Promise<FulfillmentJob | null>;
    recoverStaleRunningJobs(timeoutMs?: number): Promise<number>;
    updateJobStatus(id: string, status: FulfillmentJobStatus, extra?: Partial<Pick<FulfillmentJob, 'scheduledAt' | 'startedAt' | 'completedAt' | 'lastError' | 'attempts'>>): Promise<FulfillmentJob>;
}
export {};
