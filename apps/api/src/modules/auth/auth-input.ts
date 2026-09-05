import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';

// Bounds exist so a hostile body cannot push unbounded strings into bcrypt or a
// Prisma lookup. 254 is the RFC 5321 address limit; bcrypt only consumes the
// first 72 bytes of a password, so 512 is generous while still bounded.
const MAX_EMAIL_LENGTH = 254;
const MAX_SECRET_LENGTH = 512;
const MAX_TOKEN_LENGTH = 256;

/**
 * Narrows an untrusted request body to a plain object. `@Body()` is only a
 * compile-time annotation in this codebase: there is no global ValidationPipe,
 * so an absent body arrives as `undefined` and reaches use-case code unchecked.
 */
export function authBody(value: unknown, reasonKey: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, reasonKey, 400);
  }
  return value as Record<string, unknown>;
}

/**
 * Reads a required identifier-like field. Trimmed, because these are normalized
 * on write and surrounding whitespace is never significant.
 */
export function authToken(value: unknown, reasonKey: string, maxLength = MAX_TOKEN_LENGTH): string {
  if (typeof value !== 'string') {
    throw new AppError(ErrorCode.VALIDATION_ERROR, reasonKey, 400);
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, reasonKey, 400);
  }
  return trimmed;
}

export function authEmail(value: unknown, reasonKey: string): string {
  return authToken(value, reasonKey, MAX_EMAIL_LENGTH);
}

/**
 * Reads a required secret. Deliberately NOT trimmed: whitespace is part of a
 * password, and normalizing it here would silently change the credential a user
 * actually registered with.
 */
export function authSecret(value: unknown, reasonKey: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_SECRET_LENGTH) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, reasonKey, 400);
  }
  return value;
}
