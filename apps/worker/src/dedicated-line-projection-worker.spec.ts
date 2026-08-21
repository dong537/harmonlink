import { describe, expect, it, vi } from 'vitest';
import { DedicatedLineProjectionWorker } from './dedicated-line-projection-worker';

const baseOptions = { enabled: true, batchSize: 10, workerId: 'projection-worker' };

describe('DedicatedLineProjectionWorker', () => {
  it('does not recover leases or scan jobs while execution is disabled', async () => {
    const queue = { recoverExpiredLeases: vi.fn(), findQueued: vi.fn() };
    const executor = { execute: vi.fn() };
    const logger = { info: vi.fn(), error: vi.fn() };

    const worker = new DedicatedLineProjectionWorker(queue, executor, {
      ...baseOptions, enabled: false, logger,
    });

    await expect(worker.poll()).resolves.toBe(0);
    expect(queue.recoverExpiredLeases).not.toHaveBeenCalled();
    expect(queue.findQueued).not.toHaveBeenCalled();
    expect(executor.execute).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('dedicated_line_projection_worker_disabled');
  });

  it('recovers expired leases before claiming queued jobs with the worker id', async () => {
    const queue = {
      recoverExpiredLeases: vi.fn().mockResolvedValue(2),
      findQueued: vi.fn().mockResolvedValue([{ id: 'job-1' }, { id: 'job-2' }]),
    };
    const executor = {
      execute: vi.fn()
        .mockResolvedValueOnce({ status: 'COMPLETED', jobId: 'job-1', projectionId: 'p-1', observedVersion: 4 })
        .mockResolvedValueOnce({ status: 'NOOP', jobId: 'job-2' }),
    };
    const logger = { info: vi.fn(), error: vi.fn() };

    const worker = new DedicatedLineProjectionWorker(queue, executor, { ...baseOptions, logger });

    await expect(worker.poll()).resolves.toBe(2);
    expect(queue.recoverExpiredLeases).toHaveBeenCalledOnce();
    expect(queue.findQueued).toHaveBeenCalledWith(10);
    expect(executor.execute).toHaveBeenNthCalledWith(1, 'job-1', 'projection-worker');
    expect(executor.execute).toHaveBeenNthCalledWith(2, 'job-2', 'projection-worker');
    expect(logger.info).toHaveBeenCalledWith('dedicated_line_projection_leases_recovered', { count: 2 });
    expect(logger.info).toHaveBeenCalledWith('dedicated_line_projection_job_result', {
      status: 'COMPLETED', jobId: 'job-1', projectionId: 'p-1', observedVersion: 4,
    });
    expect(logger.info).toHaveBeenCalledWith('dedicated_line_projection_job_result', {
      status: 'NOOP', jobId: 'job-2',
    });
  });

  it('does not run overlapping polls', async () => {
    let release!: () => void;
    const firstRecover = new Promise<number>((resolve) => { release = () => resolve(0); });
    const queue = {
      recoverExpiredLeases: vi.fn().mockReturnValue(firstRecover),
      findQueued: vi.fn().mockResolvedValue([]),
    };
    const worker = new DedicatedLineProjectionWorker(queue, { execute: vi.fn() }, {
      ...baseOptions, logger: { info: vi.fn(), error: vi.fn() },
    });

    const first = worker.poll();
    await expect(worker.poll()).resolves.toBe(0);
    release();
    await expect(first).resolves.toBe(0);
    expect(queue.recoverExpiredLeases).toHaveBeenCalledOnce();
  });

  it('logs an unhandled job failure and still processes the remaining jobs', async () => {
    const queue = {
      recoverExpiredLeases: vi.fn().mockResolvedValue(0),
      findQueued: vi.fn().mockResolvedValue([{ id: 'job-1' }, { id: 'job-2' }]),
    };
    const executor = {
      execute: vi.fn()
        .mockRejectedValueOnce(new Error('node unreachable'))
        .mockResolvedValueOnce({ status: 'NEEDS_OPERATOR', jobId: 'job-2', error: 'readback_mismatch' }),
    };
    const logger = { info: vi.fn(), error: vi.fn() };

    const worker = new DedicatedLineProjectionWorker(queue, executor, { ...baseOptions, logger });

    await expect(worker.poll()).resolves.toBe(2);
    expect(executor.execute).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith('dedicated_line_projection_job_unhandled_error', {
      jobId: 'job-1',
      error: 'node unreachable',
    });
    expect(logger.info).toHaveBeenCalledWith('dedicated_line_projection_job_result', {
      status: 'NEEDS_OPERATOR', jobId: 'job-2', error: 'readback_mismatch',
    });
  });

  it('releases the running guard so a failing poll does not wedge the worker', async () => {
    const queue = {
      recoverExpiredLeases: vi.fn()
        .mockRejectedValueOnce(new Error('db down'))
        .mockResolvedValueOnce(0),
      findQueued: vi.fn().mockResolvedValue([]),
    };
    const worker = new DedicatedLineProjectionWorker(queue, { execute: vi.fn() }, {
      ...baseOptions, logger: { info: vi.fn(), error: vi.fn() },
    });

    await expect(worker.poll()).rejects.toThrow('db down');
    await expect(worker.poll()).resolves.toBe(0);
    expect(queue.recoverExpiredLeases).toHaveBeenCalledTimes(2);
  });
});
