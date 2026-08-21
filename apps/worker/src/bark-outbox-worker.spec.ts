import { describe, expect, it, vi } from 'vitest';
import { BarkOutboxWorker } from './bark-outbox-worker';
import type { BarkAlertExecutor, BarkAlertQueue } from './bark-outbox-worker';

function queueStub(overrides: Partial<BarkAlertQueue> = {}): BarkAlertQueue {
  return {
    recoverExpiredLeases: vi.fn().mockResolvedValue(0),
    findQueued: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function loggerStub() {
  return { info: vi.fn(), error: vi.fn() };
}

describe('BarkOutboxWorker', () => {
  it('does not publish and does not drain the queue when alerts are disabled', async () => {
    const queue = queueStub({ findQueued: vi.fn().mockResolvedValue([{ id: 'evt-1' }]) });
    const executor: BarkAlertExecutor = { execute: vi.fn() };
    const logger = loggerStub();
    const worker = new BarkOutboxWorker(queue, executor, {
      enabled: false,
      batchSize: 10,
      workerId: 'worker-1',
      logger,
    });

    await expect(worker.poll()).resolves.toBe(0);

    expect(queue.recoverExpiredLeases).not.toHaveBeenCalled();
    expect(queue.findQueued).not.toHaveBeenCalled();
    expect(executor.execute).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('bark_outbox_worker_disabled');
  });

  it('logs the disabled state only once across repeated polls', async () => {
    const logger = loggerStub();
    const worker = new BarkOutboxWorker(queueStub(), { execute: vi.fn() }, {
      enabled: false,
      batchSize: 5,
      workerId: 'worker-1',
      logger,
    });

    await worker.poll();
    await worker.poll();
    await worker.poll();

    const disabledLogs = logger.info.mock.calls.filter(([msg]) => msg === 'bark_outbox_worker_disabled');
    expect(disabledLogs).toHaveLength(1);
  });

  it('recovers expired leases then dispatches each queued event with the worker id', async () => {
    const queue = queueStub({
      recoverExpiredLeases: vi.fn().mockResolvedValue(2),
      findQueued: vi.fn().mockResolvedValue([{ id: 'evt-1' }, { id: 'evt-2' }]),
    });
    const executor: BarkAlertExecutor = {
      execute: vi.fn().mockResolvedValue({ eventId: 'evt-1', status: 'PUBLISHED' }),
    };
    const logger = loggerStub();
    const worker = new BarkOutboxWorker(queue, executor, {
      enabled: true,
      batchSize: 25,
      workerId: 'worker-7',
      logger,
    });

    await expect(worker.poll()).resolves.toBe(2);

    expect(queue.recoverExpiredLeases).toHaveBeenCalledTimes(1);
    expect(queue.findQueued).toHaveBeenCalledWith(25);
    expect(executor.execute).toHaveBeenNthCalledWith(1, 'evt-1', 'worker-7');
    expect(executor.execute).toHaveBeenNthCalledWith(2, 'evt-2', 'worker-7');
    expect(logger.info).toHaveBeenCalledWith('bark_alert_leases_recovered', { count: 2 });
  });

  it('keeps processing the remaining events after one event throws', async () => {
    const queue = queueStub({
      findQueued: vi.fn().mockResolvedValue([{ id: 'evt-1' }, { id: 'evt-2' }]),
    });
    const executor: BarkAlertExecutor = {
      execute: vi.fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({ eventId: 'evt-2', status: 'PUBLISHED' }),
    };
    const logger = loggerStub();
    const worker = new BarkOutboxWorker(queue, executor, {
      enabled: true,
      batchSize: 10,
      workerId: 'worker-1',
      logger,
    });

    await expect(worker.poll()).resolves.toBe(2);

    expect(executor.execute).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith('bark_alert_event_unhandled_error', {
      eventId: 'evt-1',
      error: 'boom',
    });
    expect(logger.info).toHaveBeenCalledWith('bark_alert_event_result', {
      eventId: 'evt-2',
      status: 'PUBLISHED',
    });
  });

  it('prevents overlapping polls so a leased event is not dispatched twice', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queue = queueStub({
      recoverExpiredLeases: vi.fn().mockImplementation(async () => {
        await gate;
        return 0;
      }),
      findQueued: vi.fn().mockResolvedValue([{ id: 'evt-1' }]),
    });
    const executor: BarkAlertExecutor = {
      execute: vi.fn().mockResolvedValue({ eventId: 'evt-1', status: 'PUBLISHED' }),
    };
    const worker = new BarkOutboxWorker(queue, executor, {
      enabled: true,
      batchSize: 10,
      workerId: 'worker-1',
      logger: loggerStub(),
    });

    const first = worker.poll();
    await expect(worker.poll()).resolves.toBe(0);

    release?.();
    await expect(first).resolves.toBe(1);

    expect(queue.findQueued).toHaveBeenCalledTimes(1);
    expect(executor.execute).toHaveBeenCalledTimes(1);
  });

  it('clears the running flag when the queue throws so later polls still run', async () => {
    const queue = queueStub({
      recoverExpiredLeases: vi.fn()
        .mockRejectedValueOnce(new Error('db down'))
        .mockResolvedValueOnce(0),
    });
    const worker = new BarkOutboxWorker(queue, { execute: vi.fn() }, {
      enabled: true,
      batchSize: 10,
      workerId: 'worker-1',
      logger: loggerStub(),
    });

    await expect(worker.poll()).rejects.toThrow('db down');
    await expect(worker.poll()).resolves.toBe(0);
  });
});
