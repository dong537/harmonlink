import { BarkAlertOutboxRepository } from './bark-alert-outbox.repository';
import { BarkNotificationAdapter } from './bark-notification.adapter';
export type BarkAlertExecutionResult = {
    eventId: string;
    outcome: 'NOOP' | 'PUBLISHED' | 'RETRYING' | 'FAILED' | 'NEEDS_OPERATOR';
    reasonKey?: string;
    delivered?: number;
};
export declare class ProcessBarkInventoryAlertUseCase {
    private readonly outbox;
    private readonly notifier;
    constructor(outbox: BarkAlertOutboxRepository, notifier: BarkNotificationAdapter);
    execute(eventId: string, workerId: string): Promise<BarkAlertExecutionResult>;
    private recordFailure;
}
