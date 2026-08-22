import { Injectable } from '@nestjs/common';
import { AuthenticatedContext } from '../../../common/auth/auth-context';
import { ConfigService } from '../../../common/config/config.service';
import { assertStaticProxyPurchaseEnabled } from '../../orders/static-purchase-disabled';
import { ProxyLifecycleService } from '../proxy-lifecycle.service';

@Injectable()
export class RenewProxyUseCase {
  constructor(
    private readonly lifecycle: ProxyLifecycleService,
    private readonly config: ConfigService,
  ) {}

  /** Renewal extends a paid legacy term, so it is gated with the purchase path. */
  async execute(ctx: AuthenticatedContext, proxyId: string, durationDays: number, idempotencyKey?: string) {
    assertStaticProxyPurchaseEnabled(this.config.get('LEGACY_STATIC_PROXY_ENABLED'));
    return this.lifecycle.execute({ proxyId, ctx, action: 'renew', durationDays, idempotencyKey });
  }
}
