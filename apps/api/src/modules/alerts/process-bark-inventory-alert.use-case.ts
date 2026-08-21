import { Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { BarkAlertOutboxRepository, BARK_INVENTORY_LOW_TOPIC, type BarkAlertEvent } from './bark-alert-outbox.repository';
import { BarkNotificationAdapter } from './bark-notification.adapter';

export type BarkAlertExecutionResult = {
  eventId: string;
  outcome: 'NOOP' | 'PUBLISHED' | 'RETRYING' | 'FAILED' | 'NEEDS_OPERATOR';
  reasonKey?: string;
  delivered?: number;
};

type InventoryLowPayload = {
  providerCode: string;
  providerAccountId: string;
  skuId: string;
  countryCode: string;
  requestedQuantity: number | null;
  availableQuantity: number | null;
  sourceVersion: number | null;
};

@Injectable()
export class ProcessBarkInventoryAlertUseCase {
  constructor(
    private readonly outbox: BarkAlertOutboxRepository,
    private readonly notifier: BarkNotificationAdapter,
  ) {}

  async execute(eventId: string, workerId: string): Promise<BarkAlertExecutionResult> {
    const event = await this.outbox.claimRunnableEvent(eventId, workerId);
    if (!event) return { eventId, outcome: 'NOOP', reasonKey: 'bark_alert_event_not_claimable' };

    if (event.topic !== BARK_INVENTORY_LOW_TOPIC) {
      const status = await this.outbox.markFailed(
        event,
        workerId,
        'BARK_ALERT_TOPIC_UNSUPPORTED',
        { reasonKey: 'bark_alert_topic_unsupported', topic: event.topic },
        { retry: false },
      );
      return { eventId, outcome: status, reasonKey: 'bark_alert_topic_unsupported' };
    }

    let payload: InventoryLowPayload;
    try {
      payload = parseInventoryLowPayload(event.payload);
    } catch (error: unknown) {
      const reasonKey = error instanceof AppError ? error.reasonKey : 'bark_alert_payload_invalid';
      const status = await this.outbox.markFailed(
        event,
        workerId,
        'BARK_ALERT_PAYLOAD_INVALID',
        { reasonKey },
        { retry: false },
      );
      return { eventId, outcome: status, reasonKey };
    }

    try {
      const result = await this.notifier.send({
        title: 'Dedicated line inventory low',
        body: buildAlertBody(payload),
        group: 'dedicated-line-inventory',
        dedupeKey: event.dedupeKey,
      });
      await this.outbox.markPublished(event, workerId);
      return { eventId, outcome: 'PUBLISHED', delivered: result.delivered };
    } catch (error: unknown) {
      return this.recordFailure(event, workerId, error);
    }
  }

  private async recordFailure(
    event: BarkAlertEvent,
    workerId: string,
    error: unknown,
  ): Promise<BarkAlertExecutionResult> {
    const appError = error instanceof AppError ? error : null;
    const reasonKey = appError?.reasonKey ?? 'bark_alert_internal_error';
    const retry = isRetryable(appError);
    const status = await this.outbox.markFailed(
      event,
      workerId,
      appError?.code ?? ErrorCode.INTERNAL_ERROR,
      {
        reasonKey,
        httpStatus: appError?.httpStatus ?? 500,
        ...(appError?.details ? { details: appError.details } : {}),
        ...(appError ? {} : { message: error instanceof Error ? error.message.slice(0, 300) : String(error) }),
      },
      { retry },
    );
    return { eventId: event.id, outcome: status, reasonKey };
  }
}

function isRetryable(error: AppError | null): boolean {
  if (!error) return true;
  return error.code === ErrorCode.UPSTREAM_ERROR || error.code === ErrorCode.UPSTREAM_TIMEOUT;
}

function parseInventoryLowPayload(raw: unknown): InventoryLowPayload {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'bark_alert_payload_invalid', 422);
  }
  const record = raw as Record<string, unknown>;
  const providerCode = readString(record['providerCode']);
  const providerAccountId = readString(record['providerAccountId']);
  const skuId = readString(record['skuId']);
  const countryCode = readString(record['countryCode']);
  if (!providerCode || !providerAccountId || !skuId || !countryCode) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'bark_alert_payload_invalid', 422);
  }
  return {
    providerCode,
    providerAccountId,
    skuId,
    countryCode,
    requestedQuantity: readNumber(record['requestedQuantity']),
    availableQuantity: readNumber(record['availableQuantity']),
    sourceVersion: readNumber(record['sourceVersion']),
  };
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function buildAlertBody(payload: InventoryLowPayload): string {
  const requested = payload.requestedQuantity ?? 'unknown';
  const available = payload.availableQuantity ?? 'unknown';
  return [
    `provider=${payload.providerCode}`,
    `country=${payload.countryCode}`,
    `sku=${payload.skuId}`,
    `requested=${requested}`,
    `available=${available}`,
  ].join(' ');
}
