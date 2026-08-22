import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '../../common/config/config.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { ProviderAdapter, ProviderRuntimeConfig, ProxyDelivery } from '../providers/provider.types';
import { ProviderRegistryService } from '../providers/provider-registry.service';
import {
  DedicatedLineOrderJob,
  DedicatedLineOrderRepository,
  PersistDedicatedLineOrderInput,
} from './dedicated-line-order.repository';
import { ProcessDedicatedLineOrderUseCase } from './process-dedicated-line-order.use-case';

const ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const EGRESS_PASSWORD = 'egress-secret-do-not-log';
const PROVIDER_SECRET = 'provider-secret-do-not-log';

describe('ProcessDedicatedLineOrderUseCase', () => {
  it('returns NOOP without touching the provider when another worker holds the lease', async () => {
    const adapter = adapterMock();
    const { useCase, jobs } = createHarness(adapter, { claimRunnableJob: vi.fn().mockResolvedValue(null) });

    await expect(useCase.execute('job-1', 'worker-b')).resolves.toEqual({ status: 'NOOP', jobId: 'job-1' });

    expect(adapter.buyStaticProxy).not.toHaveBeenCalled();
    expect(jobs.persistCompletedOrder).not.toHaveBeenCalled();
    expect(jobs.markFailed).not.toHaveBeenCalled();
  });

  it('passes the job dedupe key as the upstream idempotency key so a replay cannot double-open a line', async () => {
    const adapter = adapterMock();
    const { useCase, jobs } = createHarness(adapter);

    await expect(useCase.execute('job-1', 'worker-a')).resolves.toMatchObject({
      status: 'COMPLETED',
      jobId: 'job-1',
      reservationId: 'reservation-1',
      exits: 1,
    });

    expect(adapter.buyStaticProxy).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'dedupe-job-1', quantity: 1, countryCode: 'US' }),
      runtimeConfig(),
    );
    expect(jobs.persistCompletedOrder).toHaveBeenCalledTimes(1);
  });

  it('queries the existing upstream order instead of buying again when an order id was already saved', async () => {
    const adapter = adapterMock();
    const { useCase } = createHarness(adapter, {
      claimRunnableJob: vi.fn().mockResolvedValue(jobRecord({ upstreamOrderId: 'upstream-order-1' })),
    });

    await expect(useCase.execute('job-1', 'worker-a')).resolves.toMatchObject({ status: 'COMPLETED' });

    expect(adapter.buyStaticProxy).not.toHaveBeenCalled();
    expect(adapter.queryOrder).toHaveBeenCalledWith(
      { upstreamOrderId: 'upstream-order-1', protocol: 'SOCKS5', countryCode: 'US' },
      runtimeConfig(),
    );
  });

  it('retries with a recorded upstream error instead of completing when the provider order fails', async () => {
    const adapter = adapterMock();
    adapter.buyStaticProxy = vi.fn().mockResolvedValue({
      upstreamOrderId: 'upstream-order-1',
      status: 'FAILED',
      proxies: [],
      failReason: 'provider_capacity_exhausted',
    });
    const { useCase, jobs } = createHarness(adapter);

    await expect(useCase.execute('job-1', 'worker-a')).resolves.toMatchObject({
      status: 'RETRYING',
      jobId: 'job-1',
    });

    expect(jobs.persistCompletedOrder).not.toHaveBeenCalled();
    expect(jobs.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'job-1' }),
      'worker-a',
      'UPSTREAM_ERROR',
      { reason: 'provider_capacity_exhausted' },
      { retry: true, releaseReservation: true },
    );
  });

  it('escalates to the operator when the provider accepts the order without an upstream order id', async () => {
    const adapter = adapterMock();
    adapter.buyStaticProxy = vi.fn().mockResolvedValue({ upstreamOrderId: '', status: 'PENDING', proxies: [] });
    const { useCase, jobs } = createHarness(adapter);

    await expect(useCase.execute('job-1', 'worker-a')).resolves.toEqual({
      status: 'NEEDS_OPERATOR',
      jobId: 'job-1',
      error: 'provider_accepted_without_order_id',
    });

    expect(jobs.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'job-1' }),
      'worker-a',
      'UPSTREAM_ORDER_ID_MISSING',
      { reason: 'provider_accepted_without_order_id' },
      { retry: false, releaseReservation: false },
    );
  });

  it('saves the upstream order id and reschedules a poll while the provider order is pending', async () => {
    const adapter = adapterMock();
    adapter.buyStaticProxy = vi.fn().mockResolvedValue({
      upstreamOrderId: 'upstream-order-1',
      status: 'PENDING',
      proxies: [],
    });
    const { useCase, jobs } = createHarness(adapter);

    await expect(useCase.execute('job-1', 'worker-a')).resolves.toMatchObject({
      status: 'RETRYING',
      upstreamOrderId: 'upstream-order-1',
    });

    expect(jobs.saveUpstreamOrderId).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'job-1' }),
      'worker-a',
      'upstream-order-1',
      expect.any(Date),
    );
    expect(jobs.persistCompletedOrder).not.toHaveBeenCalled();
  });

  it('does not buy anything when dedicated-line order execution is disabled', async () => {
    const adapter = adapterMock();
    const { useCase, jobs } = createHarness(adapter, {}, { DEDICATED_LINE_ORDER_EXECUTION_ENABLED: 'false' });

    await expect(useCase.execute('job-1', 'worker-a')).resolves.toMatchObject({ status: 'RETRYING' });

    expect(adapter.buyStaticProxy).not.toHaveBeenCalled();
    expect(jobs.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'job-1' }),
      'worker-a',
      'UPSTREAM_DISABLED',
      expect.objectContaining({ reasonKey: 'dedicated_line_order_execution_disabled' }),
      { retry: true, releaseReservation: true },
    );
  });

  it('does not buy anything when the provider is outside the dedicated-line allowlist', async () => {
    const adapter = adapterMock();
    const { useCase, jobs } = createHarness(adapter, {}, { DEDICATED_LINE_ORDER_PROVIDER_ALLOWLIST: 'PR' });

    await expect(useCase.execute('job-1', 'worker-a')).resolves.toMatchObject({ status: 'RETRYING' });

    expect(adapter.buyStaticProxy).not.toHaveBeenCalled();
    expect(jobs.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'job-1' }),
      'worker-a',
      'UPSTREAM_DISABLED',
      expect.objectContaining({ reasonKey: 'dedicated_line_provider_not_allowed' }),
      { retry: true, releaseReservation: true },
    );
  });

  it('rejects a delivery whose exit country does not match the ordered country', async () => {
    const adapter = adapterMock();
    adapter.buyStaticProxy = vi.fn().mockResolvedValue({
      upstreamOrderId: 'upstream-order-1',
      status: 'COMPLETED',
      proxies: [proxyDelivery({ countryCode: 'DE' })],
    });
    const { useCase, jobs } = createHarness(adapter);

    await expect(useCase.execute('job-1', 'worker-a')).resolves.toMatchObject({ status: 'NEEDS_OPERATOR' });

    expect(jobs.persistCompletedOrder).not.toHaveBeenCalled();
    expect(jobs.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'job-1' }),
      'worker-a',
      'UPSTREAM_ERROR',
      expect.objectContaining({ reasonKey: 'dedicated_line_exit_country_or_protocol_mismatch' }),
      { retry: false, releaseReservation: false },
    );
  });

  it('rejects a delivery that returns fewer exits than the ordered quantity', async () => {
    const adapter = adapterMock();
    adapter.buyStaticProxy = vi.fn().mockResolvedValue({
      upstreamOrderId: 'upstream-order-1',
      status: 'COMPLETED',
      proxies: [proxyDelivery()],
    });
    const { useCase, jobs } = createHarness(adapter, {
      claimRunnableJob: vi.fn().mockResolvedValue(jobRecord({ quantity: 2 })),
    });

    await expect(useCase.execute('job-1', 'worker-a')).resolves.toMatchObject({ status: 'NEEDS_OPERATOR' });

    expect(jobs.persistCompletedOrder).not.toHaveBeenCalled();
    expect(jobs.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'job-1' }),
      'worker-a',
      'UPSTREAM_ERROR',
      expect.objectContaining({ reasonKey: 'dedicated_line_proxy_count_mismatch' }),
      { retry: false, releaseReservation: false },
    );
  });

  it('derives a stable client identity fingerprint per line from the job, not from the customer email', async () => {
    const adapter = adapterMock();
    const first = createHarness(adapter);
    await first.useCase.execute('job-1', 'worker-a');
    const second = createHarness(adapterMock());
    await second.useCase.execute('job-1', 'worker-b');

    const firstExit = persistedInput(first.jobs).exits[0];
    const secondExit = persistedInput(second.jobs).exits[0];

    expect(firstExit.clientIdentityFingerprint).toBe(secondExit.clientIdentityFingerprint);
    expect(firstExit.clientIdentityFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(firstExit.clientEmail).toBe(`line-${firstExit.lineId}@365proxy.internal`);
    expect(firstExit.clientEmail).not.toContain('customer@example.com');
  });

  it('gives each exit of a multi-quantity order a distinct line identity', async () => {
    const adapter = adapterMock();
    adapter.buyStaticProxy = vi.fn().mockResolvedValue({
      upstreamOrderId: 'upstream-order-1',
      status: 'COMPLETED',
      proxies: [
        proxyDelivery({ upstreamProxyId: 'up-1', ip: '203.0.113.10' }),
        proxyDelivery({ upstreamProxyId: 'up-2', ip: '203.0.113.11' }),
      ],
    });
    const { useCase, jobs } = createHarness(adapter, {
      claimRunnableJob: vi.fn().mockResolvedValue(jobRecord({ quantity: 2 })),
    });

    await expect(useCase.execute('job-1', 'worker-a')).resolves.toMatchObject({ status: 'COMPLETED', exits: 2 });

    const exits = persistedInput(jobs).exits;
    expect(new Set(exits.map((exit) => exit.lineId)).size).toBe(2);
    expect(new Set(exits.map((exit) => exit.clientIdentityFingerprint)).size).toBe(2);
    expect(new Set(exits.map((exit) => exit.identityFingerprint)).size).toBe(2);
  });

  it('keeps the reservation when persistence fails after the upstream purchase, so a paid line is never refunded', async () => {
    const adapter = adapterMock();
    const { useCase, jobs } = createHarness(adapter, {
      persistCompletedOrder: vi
        .fn()
        .mockRejectedValue(new AppError(ErrorCode.UPSTREAM_OUT_OF_STOCK, 'stock_reservation_expired', 422)),
    });

    await useCase.execute('job-1');

    expect(adapter.buyStaticProxy).toHaveBeenCalled();
    expect(jobs.markFailed).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      String(ErrorCode.UPSTREAM_OUT_OF_STOCK),
      expect.anything(),
      { retry: true, releaseReservation: false },
    );
  });

  it('releases the reservation when a pre-purchase payload error occurs, without retrying a deterministic failure', async () => {
    const adapter = adapterMock();
    const job = jobRecord();
    const payload = job.payload as Record<string, unknown>;
    delete (payload['request'] as Record<string, unknown>)['protocol'];
    const { useCase, jobs } = createHarness(adapter, { claimRunnableJob: vi.fn().mockResolvedValue(job) });

    await useCase.execute('job-1');

    expect(adapter.buyStaticProxy).not.toHaveBeenCalled();
    expect(jobs.markFailed).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      String(ErrorCode.VALIDATION_ERROR),
      expect.anything(),
      { retry: false, releaseReservation: true },
    );
  });

  it('keeps encryption keys and provider secrets out of persisted plaintext and failure details', async () => {
    const adapter = adapterMock();
    const { useCase, jobs } = createHarness(adapter);
    await useCase.execute('job-1', 'worker-a');

    const persisted = JSON.stringify(persistedInput(jobs));
    expect(persisted).not.toContain(ENCRYPTION_KEY);
    expect(persisted).not.toContain(EGRESS_PASSWORD);
    expect(persisted).not.toContain(PROVIDER_SECRET);

    const failing = adapterMock();
    failing.buyStaticProxy = vi
      .fn()
      .mockRejectedValue(new AppError(ErrorCode.UPSTREAM_ERROR, 'upstream_rejected_order', 502));
    const harness = createHarness(failing);
    await harness.useCase.execute('job-1', 'worker-a');

    const detail = JSON.stringify(vi.mocked(harness.jobs.markFailed).mock.calls[0]?.[3] ?? {});
    expect(detail).toContain('upstream_rejected_order');
    expect(detail).not.toContain(ENCRYPTION_KEY);
    expect(detail).not.toContain(PROVIDER_SECRET);
    expect(detail).not.toContain(EGRESS_PASSWORD);
  });
});

function createHarness(
  adapter: ProviderAdapter,
  jobOverrides: Partial<Record<keyof DedicatedLineOrderRepository, unknown>> = {},
  configOverrides: Record<string, string> = {},
): { useCase: ProcessDedicatedLineOrderUseCase; jobs: DedicatedLineOrderRepository } {
  const jobs = {
    claimRunnableJob: vi.fn().mockResolvedValue(jobRecord()),
    saveUpstreamOrderId: vi.fn().mockResolvedValue(undefined),
    persistCompletedOrder: vi.fn().mockResolvedValue({ status: 'COMPLETED' }),
    markFailed: vi.fn().mockImplementation((_job, _worker, _code, _detail, options: { retry: boolean }) =>
      Promise.resolve(options.retry ? 'RETRYING' : 'NEEDS_OPERATOR'),
    ),
    releaseReservation: vi.fn().mockResolvedValue(undefined),
    ...jobOverrides,
  } as unknown as DedicatedLineOrderRepository;
  const registry = {
    getConfigForProviderAccount: vi.fn().mockResolvedValue(runtimeConfig()),
    getAdapter: vi.fn().mockReturnValue(adapter),
  } as unknown as ProviderRegistryService;
  const config = {
    get: vi.fn().mockImplementation((key: string) => {
      const values: Record<string, string> = {
        APP_ENCRYPTION_KEY: ENCRYPTION_KEY,
        DEDICATED_LINE_ORDER_EXECUTION_ENABLED: 'true',
        DEDICATED_LINE_ORDER_PROVIDER_ALLOWLIST: 'IPIPD',
        DEDICATED_LINE_ORDER_ACCOUNT_ALLOWLIST: '',
        ...configOverrides,
      };
      return values[key] ?? '';
    }),
  } as unknown as ConfigService;
  return { useCase: new ProcessDedicatedLineOrderUseCase(jobs, registry, config), jobs };
}

function persistedInput(jobs: DedicatedLineOrderRepository): PersistDedicatedLineOrderInput {
  const call = vi.mocked(jobs.persistCompletedOrder).mock.calls[0];
  if (!call) throw new Error('persistCompletedOrder was not called');
  return call[0];
}

function jobRecord(overrides: { quantity?: number; upstreamOrderId?: string } = {}): DedicatedLineOrderJob {
  return {
    id: 'job-1',
    siteId: 'site-1',
    tenantId: 'tenant-1',
    kind: 'PROVIDER_DEDICATED_LINE_ORDER',
    aggregateId: 'reservation-1',
    dedupeKey: 'dedupe-job-1',
    status: 'LEASED',
    attempt: 1,
    maxAttempts: 5,
    desiredVersion: 1,
    leaseOwner: 'worker-a',
    leaseExpiresAt: new Date('2026-08-21T00:01:00.000Z'),
    nextRunAt: new Date('2026-08-21T00:00:00.000Z'),
    lastErrorCode: null,
    lastErrorDetail: null,
    completedAt: null,
    createdAt: new Date('2026-08-21T00:00:00.000Z'),
    updatedAt: new Date('2026-08-21T00:00:00.000Z'),
    payload: {
      providerCode: 'IPIPD',
      providerAccountId: 'provider-account-1',
      skuId: 'sku-1',
      countryCode: 'US',
      quantity: overrides.quantity ?? 1,
      reservationId: 'reservation-1',
      ...(overrides.upstreamOrderId ? { upstreamOrderId: overrides.upstreamOrderId } : {}),
      request: {
        durationDays: 30,
        currency: 'CNY',
        protocol: 'SOCKS5',
        providerResourceId: 'line-us-standard',
        placementPolicyId: 'policy-1',
        inboundProfileId: 'inbound-profile-1',
        inboundTag: 'inbound-us-1',
        lineProtocol: 'VLESS',
        maxReplicaFanout: 2,
      },
    },
  } as unknown as DedicatedLineOrderJob;
}

function adapterMock(): ProviderAdapter {
  const completed = {
    upstreamOrderId: 'upstream-order-1',
    status: 'COMPLETED' as const,
    proxies: [proxyDelivery()],
  };
  return {
    code: 'IPIPD',
    healthCheck: vi.fn(),
    syncInventory: vi.fn(),
    buildBuyRequest: vi.fn(),
    buyStaticProxy: vi.fn().mockResolvedValue(completed),
    queryOrder: vi.fn().mockResolvedValue(completed),
  };
}

function proxyDelivery(overrides: Partial<ProxyDelivery> = {}): ProxyDelivery {
  return {
    upstreamProxyId: 'up-proxy-1',
    ip: '203.0.113.10',
    port: 41000,
    username: 'exit-user-1',
    password: EGRESS_PASSWORD,
    protocol: 'SOCKS5',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    countryCode: 'US',
    ...overrides,
  };
}

function runtimeConfig(): ProviderRuntimeConfig {
  return {
    code: 'IPIPD',
    status: 'ACTIVE',
    siteId: 'site-1',
    upstreamAccountId: 'provider-account-1',
    baseUrl: 'https://api.ipipd.cn',
    timeoutMs: 15000,
    inventorySyncEnabled: true,
    enabledCountryCodes: ['US'],
    credential: { appId: 'app-1', appSecret: PROVIDER_SECRET },
  };
}
