import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { BARK_INVENTORY_LOW_TOPIC } from './bark-alert-outbox.repository';
import { ProcessBarkInventoryAlertUseCase } from './process-bark-inventory-alert.use-case';

function alertEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt-1',
    topic: BARK_INVENTORY_LOW_TOPIC,
    desiredVersion: 1,
    attempt: 1,
    maxAttempts: 5,
    dedupeKey: 'inventory-low:sku-1:v1',
    payload: {
      providerCode: 'IPIPD',
      providerAccountId: 'acct-1',
      skuId: 'sku-1',
      countryCode: 'HK',
      requestedQuantity: 10,
      availableQuantity: 2,
      sourceVersion: 7,
    },
    ...overrides,
  };
}

describe('ProcessBarkInventoryAlertUseCase', () => {
  it('publishes a claimed inventory alert through the real Bark adapter', async () => {
    const event = alertEvent();
    const outbox = {
      claimRunnableEvent: vi.fn().mockResolvedValue(event),
      markPublished: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn(),
    };
    const notifier = { send: vi.fn().mockResolvedValue({ attempted: 2, delivered: 2 }) };
    const useCase = new ProcessBarkInventoryAlertUseCase(outbox as never, notifier as never);

    await expect(useCase.execute('evt-1', 'bark-worker')).resolves.toEqual({
      eventId: 'evt-1', outcome: 'PUBLISHED', delivered: 2,
    });
    expect(notifier.send).toHaveBeenCalledWith({
      title: 'Dedicated line inventory low',
      body: 'provider=IPIPD country=HK sku=sku-1 requested=10 available=2',
      group: 'dedicated-line-inventory',
      dedupeKey: 'inventory-low:sku-1:v1',
    });
    expect(outbox.markPublished).toHaveBeenCalledWith(event, 'bark-worker');
    expect(outbox.markFailed).not.toHaveBeenCalled();
  });

  it('records an upstream Bark failure as a retryable event and never marks it published', async () => {
    const event = alertEvent();
    const outbox = {
      claimRunnableEvent: vi.fn().mockResolvedValue(event),
      markPublished: vi.fn(),
      markFailed: vi.fn().mockResolvedValue('RETRYING'),
    };
    const notifier = {
      send: vi.fn().mockRejectedValue(
        new AppError(ErrorCode.UPSTREAM_ERROR, 'bark_http_error', 502, undefined, { upstreamHttpStatus: 500 }),
      ),
    };
    const useCase = new ProcessBarkInventoryAlertUseCase(outbox as never, notifier as never);

    await expect(useCase.execute('evt-1', 'bark-worker')).resolves.toEqual({
      eventId: 'evt-1', outcome: 'RETRYING', reasonKey: 'bark_http_error',
    });
    expect(outbox.markPublished).not.toHaveBeenCalled();
    expect(outbox.markFailed).toHaveBeenCalledWith(
      event,
      'bark-worker',
      ErrorCode.UPSTREAM_ERROR,
      { reasonKey: 'bark_http_error', httpStatus: 502, details: { upstreamHttpStatus: 500 } },
      { retry: true },
    );
  });

  it('records a Bark timeout as retryable without publishing', async () => {
    const event = alertEvent();
    const outbox = {
      claimRunnableEvent: vi.fn().mockResolvedValue(event),
      markPublished: vi.fn(),
      markFailed: vi.fn().mockResolvedValue('FAILED'),
    };
    const notifier = {
      send: vi.fn().mockRejectedValue(new AppError(ErrorCode.UPSTREAM_TIMEOUT, 'bark_timeout', 504)),
    };
    const useCase = new ProcessBarkInventoryAlertUseCase(outbox as never, notifier as never);

    await expect(useCase.execute('evt-1', 'bark-worker')).resolves.toEqual({
      eventId: 'evt-1', outcome: 'FAILED', reasonKey: 'bark_timeout',
    });
    expect(outbox.markPublished).not.toHaveBeenCalled();
    expect(outbox.markFailed).toHaveBeenCalledWith(
      event, 'bark-worker', ErrorCode.UPSTREAM_TIMEOUT,
      { reasonKey: 'bark_timeout', httpStatus: 504 }, { retry: true },
    );
  });

  it('escalates a missing device-key configuration to operator handling instead of retrying forever', async () => {
    const event = alertEvent();
    const outbox = {
      claimRunnableEvent: vi.fn().mockResolvedValue(event),
      markPublished: vi.fn(),
      markFailed: vi.fn().mockResolvedValue('NEEDS_OPERATOR'),
    };
    const notifier = {
      send: vi.fn().mockRejectedValue(new AppError(ErrorCode.VALIDATION_ERROR, 'bark_device_keys_missing', 422)),
    };
    const useCase = new ProcessBarkInventoryAlertUseCase(outbox as never, notifier as never);

    await expect(useCase.execute('evt-1', 'bark-worker')).resolves.toEqual({
      eventId: 'evt-1', outcome: 'NEEDS_OPERATOR', reasonKey: 'bark_device_keys_missing',
    });
    expect(outbox.markPublished).not.toHaveBeenCalled();
    expect(outbox.markFailed).toHaveBeenCalledWith(
      event, 'bark-worker', ErrorCode.VALIDATION_ERROR,
      { reasonKey: 'bark_device_keys_missing', httpStatus: 422 }, { retry: false },
    );
  });

  it('records an unexpected non-AppError failure as retryable and keeps the event queued', async () => {
    const event = alertEvent();
    const outbox = {
      claimRunnableEvent: vi.fn().mockResolvedValue(event),
      markPublished: vi.fn(),
      markFailed: vi.fn().mockResolvedValue('RETRYING'),
    };
    const notifier = { send: vi.fn().mockRejectedValue(new Error('socket hang up')) };
    const useCase = new ProcessBarkInventoryAlertUseCase(outbox as never, notifier as never);

    await expect(useCase.execute('evt-1', 'bark-worker')).resolves.toEqual({
      eventId: 'evt-1', outcome: 'RETRYING', reasonKey: 'bark_alert_internal_error',
    });
    expect(outbox.markPublished).not.toHaveBeenCalled();
    expect(outbox.markFailed).toHaveBeenCalledWith(
      event, 'bark-worker', ErrorCode.INTERNAL_ERROR,
      { reasonKey: 'bark_alert_internal_error', httpStatus: 500, message: 'socket hang up' },
      { retry: true },
    );
  });

  it('treats an unclaimable event as a no-op so a lease race cannot double-send', async () => {
    const outbox = {
      claimRunnableEvent: vi.fn().mockResolvedValue(null),
      markPublished: vi.fn(),
      markFailed: vi.fn(),
    };
    const notifier = { send: vi.fn() };
    const useCase = new ProcessBarkInventoryAlertUseCase(outbox as never, notifier as never);

    await expect(useCase.execute('evt-1', 'bark-worker')).resolves.toEqual({
      eventId: 'evt-1', outcome: 'NOOP', reasonKey: 'bark_alert_event_not_claimable',
    });
    expect(notifier.send).not.toHaveBeenCalled();
    expect(outbox.markPublished).not.toHaveBeenCalled();
    expect(outbox.markFailed).not.toHaveBeenCalled();
  });

  it('escalates an invalid alert payload without sending a notification', async () => {
    const event = alertEvent({ payload: { providerCode: 'IPIPD', skuId: '' } });
    const outbox = {
      claimRunnableEvent: vi.fn().mockResolvedValue(event),
      markPublished: vi.fn(),
      markFailed: vi.fn().mockResolvedValue('NEEDS_OPERATOR'),
    };
    const notifier = { send: vi.fn() };
    const useCase = new ProcessBarkInventoryAlertUseCase(outbox as never, notifier as never);

    await expect(useCase.execute('evt-1', 'bark-worker')).resolves.toEqual({
      eventId: 'evt-1', outcome: 'NEEDS_OPERATOR', reasonKey: 'bark_alert_payload_invalid',
    });
    expect(notifier.send).not.toHaveBeenCalled();
    expect(outbox.markPublished).not.toHaveBeenCalled();
    expect(outbox.markFailed).toHaveBeenCalledWith(
      event, 'bark-worker', 'BARK_ALERT_PAYLOAD_INVALID',
      { reasonKey: 'bark_alert_payload_invalid' }, { retry: false },
    );
  });

  it('escalates an unsupported topic instead of publishing it', async () => {
    const event = alertEvent({ topic: 'alerts.bark.unknown' });
    const outbox = {
      claimRunnableEvent: vi.fn().mockResolvedValue(event),
      markPublished: vi.fn(),
      markFailed: vi.fn().mockResolvedValue('NEEDS_OPERATOR'),
    };
    const notifier = { send: vi.fn() };
    const useCase = new ProcessBarkInventoryAlertUseCase(outbox as never, notifier as never);

    await expect(useCase.execute('evt-1', 'bark-worker')).resolves.toEqual({
      eventId: 'evt-1', outcome: 'NEEDS_OPERATOR', reasonKey: 'bark_alert_topic_unsupported',
    });
    expect(notifier.send).not.toHaveBeenCalled();
    expect(outbox.markPublished).not.toHaveBeenCalled();
  });
});
