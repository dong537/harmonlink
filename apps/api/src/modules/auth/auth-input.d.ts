/**
 * Narrows an untrusted request body to a plain object. `@Body()` is only a
 * compile-time annotation in this codebase: there is no global ValidationPipe,
 * so an absent body arrives as `undefined` and reaches use-case code unchecked.
 */
export declare function authBody(value: unknown, reasonKey: string): Record<string, unknown>;
/**
 * Reads a required identifier-like field. Trimmed, because these are normalized
 * on write and surrounding whitespace is never significant.
 */
export declare function authToken(value: unknown, reasonKey: string, maxLength?: number): string;
export declare function authEmail(value: unknown, reasonKey: string): string;
/**
 * Reads a required secret. Deliberately NOT trimmed: whitespace is part of a
 * password, and normalizing it here would silently change the credential a user
 * actually registered with.
 */
export declare function authSecret(value: unknown, reasonKey: string): string;
