import { Prisma } from '@ipeasy/db/generated/client';
export declare const BARK_INVENTORY_LOW_TOPIC = "alerts.bark.inventory_low";
export declare const BARK_ALERT_TOPICS: readonly ["alerts.bark.inventory_low"];
export type BarkAlertEvent = Prisma.outbox_eventsGetPayload<Record<string, never>>;
export declare class BarkAlertOutboxRepository {
    findQueued(limit?: number): Promise<Array<Pick<BarkAlertEvent, 'id'>>>;
    claimRunnableEvent(eventId: string, workerId: string, leaseMs?: number): Promise<BarkAlertEvent | null>;
    recoverExpiredLeases(): Promise<number>;
    markPublished(event: BarkAlertEvent, workerId: string): Promise<void>;
    releaseClaimed(event: BarkAlertEvent, workerId: string): Promise<void>;
    markFailed(event: BarkAlertEvent, workerId: string, code: string, detail: Record<string, unknown>, options: {
        retry: boolean;
    }): Promise<'RETRYING' | 'FAILED' | 'NEEDS_OPERATOR'>;
}
