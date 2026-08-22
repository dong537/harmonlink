import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';

export function assertStaticProxyPurchaseDisabled(): never {
  throw new AppError(ErrorCode.PRODUCT_DISABLED, 'static_proxy_purchase_disabled', 410);
}

/**
 * The legacy residential ("家宽") purchase path ships disabled and fails closed:
 * anything other than the explicit 'true' opt-in is rejected before any pricing,
 * wallet, or upstream work happens.
 */
export function assertStaticProxyPurchaseEnabled(flag: 'true' | 'false'): void {
  if (flag !== 'true') {
    assertStaticProxyPurchaseDisabled();
  }
}
