import type { AuthenticatedContext } from '../../common/auth/auth-context';
import { ConfigService } from '../../common/config/config.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';

export function assertLegacyApiAccess(
  config: ConfigService,
  context?: Pick<AuthenticatedContext, 'siteId'>,
): string {
  if (config.get('LEGACY_API_V1_ENABLED') !== 'true') {
    throw new AppError(ErrorCode.NOT_FOUND, 'legacy_api_disabled', 404);
  }

  // ConfigService normally returns the schema default (`''`), but keep the
  // compatibility boundary typed when a test provider or an incomplete
  // runtime config returns `undefined`/`null` instead.
  const configuredSiteId = config.get('LEGACY_API_SITE_ID');
  const siteId = typeof configuredSiteId === 'string' ? configuredSiteId.trim() : '';
  if (!siteId) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'legacy_api_site_not_configured', 500);
  }
  if (context && context.siteId !== siteId) {
    throw new AppError(ErrorCode.PERMISSION_DENIED, 'legacy_api_site_mismatch', 403);
  }
  return siteId;
}
