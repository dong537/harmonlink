import { describe, expect, it, vi } from 'vitest';
import {
  ReclaimExpiredReservationsUseCase,
  type ExpiredReservationCandidate,
  type ExpiredReservationSource,
} from './domain';

const now = new Date('2026-08-22T10:00:00.000Z');

function candidate(overrides: Partial<ExpiredReservationCandidate> = {}): ExpiredReservationCandidate {
  return {
    reservationId: 'res-1',
    siteId: 'site-1',
    quantity: 2,
    jobId: 'job-1',
    neverIssued: true,
    ...overrides,
  };
}

function source(candidates: ExpiredReservationCandidate[], reclaimResult = true): ExpiredReservationSource & {
  reclaim: ReturnType<typeof vi.fn>;
} {
  return {
    findExpiredCandidates: vi.fn().mockResolvedValue(candidates),
    reclaim: vi.fn().mockResolvedValue(reclaimResult),
  };
}

describe('ReclaimExpiredReservationsUseCase', () => {
  it('returns stock and money for a reservation whose purchase never ran', async () => {
    const src = source([candidate()]);

    const result = await new ReclaimExpiredReservationsUseCase(src).execute(now);

    expect(result).toEqual({ scanned: 1, reclaimed: 1, skippedIssued: 0 });
    expect(src.reclaim).toHaveBeenCalledWith(candidate(), now);
  });

  it('never reclaims a reservation whose purchase already reached the provider', async () => {
    const src = source([candidate({ neverIssued: false })]);

    const result = await new ReclaimExpiredReservationsUseCase(src).execute(now);

    expect(result).toEqual({ scanned: 1, reclaimed: 0, skippedIssued: 1 });
    expect(src.reclaim).not.toHaveBeenCalled();
  });

  it('leaves a reservation alone when its purchase job cannot be found', async () => {
    const src = source([candidate({ jobId: null, neverIssued: false })]);

    const result = await new ReclaimExpiredReservationsUseCase(src).execute(now);

    expect(result.reclaimed).toBe(0);
    expect(result.skippedIssued).toBe(1);
    expect(src.reclaim).not.toHaveBeenCalled();
  });

  it('does not count a reservation another worker already reclaimed', async () => {
    const src = source([candidate()], false);

    const result = await new ReclaimExpiredReservationsUseCase(src).execute(now);

    expect(result).toEqual({ scanned: 1, reclaimed: 0, skippedIssued: 0 });
  });

  it('processes every candidate independently in one sweep', async () => {
    const src = source([
      candidate({ reservationId: 'res-1' }),
      candidate({ reservationId: 'res-2', neverIssued: false }),
      candidate({ reservationId: 'res-3' }),
    ]);

    const result = await new ReclaimExpiredReservationsUseCase(src).execute(now);

    expect(result).toEqual({ scanned: 3, reclaimed: 2, skippedIssued: 1 });
  });

  it('passes the caller scan limit through to the source', async () => {
    const src = source([]);

    const result = await new ReclaimExpiredReservationsUseCase(src).execute(now, 25);

    expect(src.findExpiredCandidates).toHaveBeenCalledWith(now, 25);
    expect(result).toEqual({ scanned: 0, reclaimed: 0, skippedIssued: 0 });
  });
});
