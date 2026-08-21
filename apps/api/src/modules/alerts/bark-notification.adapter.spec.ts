import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { BarkNotificationAdapter } from './bark-notification.adapter';

const SECRET_KEY_A = 'devicekeyAAAAsecret';
const SECRET_KEY_B = 'devicekeyBBBBsecret';

function configStub(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    BARK_SERVER_URL: 'https://api.day.app',
    BARK_DEVICE_KEYS: `${SECRET_KEY_A},${SECRET_KEY_B}`,
    BARK_REQUEST_TIMEOUT_MS: 8000,
    ...overrides,
  };
  return { get: vi.fn((key: string) => values[key]) };
}

function jsonResponse(code: number, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify({ code, message: 'ok' }),
  } as unknown as Response;
}

const notification = {
  title: 'Dedicated line inventory low',
  body: 'provider=IPIPD country=HK sku=sku-1 requested=10 available=2',
  group: 'dedicated-line-inventory',
  dedupeKey: 'inventory-low:sku-1:v1',
};

describe('BarkNotificationAdapter', () => {
  it('pushes to every configured device key over real HTTP', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200));
    const adapter = new BarkNotificationAdapter(configStub() as never, fetchImpl);

    await expect(adapter.send(notification)).resolves.toEqual({ attempted: 2, delivered: 2 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.day.app/push');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      device_key: SECRET_KEY_A,
      title: notification.title,
      body: notification.body,
      group: notification.group,
    });
  });

  it('fails with a missing-configuration error rather than silently skipping delivery', async () => {
    const fetchImpl = vi.fn();
    const adapter = new BarkNotificationAdapter(configStub({ BARK_DEVICE_KEYS: '  ' }) as never, fetchImpl);

    await expect(adapter.send(notification)).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
      reasonKey: 'bark_device_keys_missing',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(adapter.deviceKeyCount()).toBe(0);
  });

  it('treats a non-2xx upstream response as an upstream failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, 500));
    const adapter = new BarkNotificationAdapter(
      configStub({ BARK_DEVICE_KEYS: SECRET_KEY_A }) as never,
      fetchImpl,
    );

    await expect(adapter.send(notification)).rejects.toMatchObject({
      code: ErrorCode.UPSTREAM_ERROR,
      reasonKey: 'bark_http_error',
      details: { upstreamHttpStatus: 500 },
    });
  });

  it('treats a 200 response carrying a failure envelope as unhealthy, not success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(400));
    const adapter = new BarkNotificationAdapter(
      configStub({ BARK_DEVICE_KEYS: SECRET_KEY_A }) as never,
      fetchImpl,
    );

    await expect(adapter.send(notification)).rejects.toMatchObject({
      code: ErrorCode.UPSTREAM_ERROR,
      reasonKey: 'bark_envelope_error',
      details: { upstreamCode: 400 },
    });
  });

  it('reports partial delivery when only one device key fails', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, 500))
      .mockResolvedValueOnce(jsonResponse(200));
    const adapter = new BarkNotificationAdapter(configStub() as never, fetchImpl);

    await expect(adapter.send(notification)).resolves.toEqual({ attempted: 2, delivered: 1 });
  });

  it('never exposes a device key through thrown errors', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error(`socket hang up ${SECRET_KEY_A}`));
    const adapter = new BarkNotificationAdapter(configStub() as never, fetchImpl);

    const error = await adapter.send(notification).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(AppError);

    const serialized = JSON.stringify({
      code: (error as AppError).code,
      reasonKey: (error as AppError).reasonKey,
      message: (error as AppError).message,
      details: (error as AppError).details,
    });
    expect(serialized).not.toContain(SECRET_KEY_A);
    expect(serialized).not.toContain(SECRET_KEY_B);
  });

  it('rejects an unsafe Bark server URL before any outbound request', async () => {
    const fetchImpl = vi.fn();
    const adapter = new BarkNotificationAdapter(
      configStub({ BARK_SERVER_URL: 'http://127.0.0.1:8080' }) as never,
      fetchImpl,
    );

    await expect(adapter.send(notification)).rejects.toBeInstanceOf(AppError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
