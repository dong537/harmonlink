import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '../../common/config/config.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { assertSafeUrl } from '../../common/utils/ssrf';
import { fetchWithTimeout } from '../providers/provider-http';

type FetchLike = typeof fetch;

export const BARK_NOTIFICATION_FETCH = 'BARK_NOTIFICATION_FETCH';

export type BarkNotification = {
  title: string;
  body: string;
  group: string;
  dedupeKey: string;
};

export type BarkDeliveryResult = {
  attempted: number;
  delivered: number;
};

@Injectable()
export class BarkNotificationAdapter {
  private readonly fetchImpl: FetchLike;

  constructor(
    private readonly config: ConfigService,
    @Optional() @Inject(BARK_NOTIFICATION_FETCH) fetchImpl?: FetchLike,
  ) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  deviceKeyCount(): number {
    return this.deviceKeys().length;
  }

  async send(notification: BarkNotification): Promise<BarkDeliveryResult> {
    const deviceKeys = this.deviceKeys();
    if (deviceKeys.length === 0) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'bark_device_keys_missing', 422);
    }
    const serverUrl = this.config.get('BARK_SERVER_URL').replace(/\/$/, '');
    assertSafeUrl(serverUrl);
    const timeoutMs = this.config.get('BARK_REQUEST_TIMEOUT_MS');

    let delivered = 0;
    let lastFailure: AppError | null = null;
    for (const deviceKey of deviceKeys) {
      try {
        await this.push(serverUrl, deviceKey, notification, timeoutMs);
        delivered += 1;
      } catch (error: unknown) {
        lastFailure = error instanceof AppError
          ? error
          : new AppError(
            ErrorCode.UPSTREAM_ERROR,
            'bark_network_error',
            502,
            redactDeviceKeys(
              error instanceof Error ? error.message : String(error),
              deviceKeys,
            ).slice(0, 300),
          );
      }
    }
    if (delivered === 0 && lastFailure) throw lastFailure;
    return { attempted: deviceKeys.length, delivered };
  }

  private async push(
    serverUrl: string,
    deviceKey: string,
    notification: BarkNotification,
    timeoutMs: number,
  ): Promise<void> {
    const response = await fetchWithTimeout(
      `${serverUrl}/push`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          device_key: deviceKey,
          title: notification.title,
          body: notification.body,
          group: notification.group,
        }),
      },
      timeoutMs,
      this.fetchImpl,
    );

    if (!response.ok) {
      throw new AppError(ErrorCode.UPSTREAM_ERROR, 'bark_http_error', 502, undefined, {
        upstreamHttpStatus: response.status,
      });
    }

    const raw = await response.text();
    let envelope: unknown;
    try {
      envelope = JSON.parse(raw) as unknown;
    } catch {
      throw new AppError(ErrorCode.UPSTREAM_ERROR, 'bark_response_invalid', 502);
    }
    const code = readCode(envelope);
    if (code !== 200) {
      throw new AppError(ErrorCode.UPSTREAM_ERROR, 'bark_envelope_error', 502, undefined, {
        upstreamCode: code,
      });
    }
  }

  private deviceKeys(): string[] {
    return this.config
      .get('BARK_DEVICE_KEYS')
      .split(',')
      .map((key) => key.trim())
      .filter((key) => key.length > 0);
  }
}

function redactDeviceKeys(text: string, deviceKeys: readonly string[]): string {
  return deviceKeys.reduce(
    (acc, deviceKey) => (deviceKey.length > 0 ? acc.split(deviceKey).join('[redacted]') : acc),
    text,
  );
}

function readCode(envelope: unknown): number | null {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return null;
  const code = (envelope as Record<string, unknown>)['code'];
  return typeof code === 'number' ? code : null;
}
