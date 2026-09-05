import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-codes';
import { AuthRepository } from '../auth.repository';
import { RegisterResponseDto } from '../dto';
import { authBody } from '../auth-input';
import { ConfigService } from '../../../common/config/config.service';
import { requestIdStorage } from '../../../common/logging/request-id.context';

const BCRYPT_COST = 10;
const MIN_PASSWORD_LENGTH = 8;
// Pragmatic single-pass email shape check; full RFC validation is left to the
// account lifecycle, not the signup gate.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class RegisterUserUseCase {
  constructor(
    private readonly authRepo: AuthRepository,
    private readonly config: ConfigService,
  ) {}

  /**
   * Self-service customer signup. Validates email shape and password strength,
   * rejects duplicate accounts (without leaking which field collided), lands the
   * user in the site's default signup tenant, then creates the user + zero-balance
   * wallet + audit row in one transaction and returns a session so the new user is
   * logged in immediately.
   */
  async execute(input: unknown): Promise<RegisterResponseDto> {
    // Narrow the body first: without a global ValidationPipe an absent body
    // arrives as `undefined`, and reading `.email` off it throws a TypeError
    // that would surface as a 500 instead of a 400.
    const body = authBody(input, 'register_body_invalid');
    const email = typeof body['email'] === 'string' ? body['email'].trim() : '';
    const password = typeof body['password'] === 'string' ? body['password'] : '';
    const siteId = typeof body['siteId'] === 'string' ? body['siteId'] : '';
    const tenantId = typeof body['tenantId'] === 'string' ? body['tenantId'].trim() : '';

    if (!siteId) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'site_required', 400);
    }
    if (!EMAIL_PATTERN.test(email)) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'invalid_email', 400);
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'password_too_weak', 400);
    }

    // users.email is unique per site, so dedup is scoped to this site. Checking
    // globally would reject someone who legitimately holds an account on another
    // site, and would make this 409 a cross-site account-existence oracle.
    const existing = await this.authRepo.findUserByEmail(siteId, email);
    if (existing) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'email_taken', 409);
    }

    const tenant = tenantId
      ? await this.authRepo.findSignupTenantById(siteId, tenantId)
      : await this.authRepo.findSignupTenant(siteId);
    if (!tenant) {
      // Misconfigured site (no ACTIVE tenant). Fail loudly instead of guessing.
      throw new AppError(
        tenantId ? ErrorCode.VALIDATION_ERROR : ErrorCode.INTERNAL_ERROR,
        tenantId ? 'signup_tenant_invalid' : 'no_signup_tenant',
        tenantId ? 400 : 500,
      );
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const currency = this.config.get('APP_PLATFORM_CURRENCY');
    const requestId = requestIdStorage.getStore() ?? '';

    const user = await this.authRepo.createUserWithWallet({
      siteId,
      tenantId: tenant.id,
      email,
      passwordHash,
      currency,
      requestId,
    });

    return this.authRepo.issueSession({
      ownerType: 'USER',
      ownerId: user.id,
      siteId,
      tenantId: tenant.id,
    });
  }
}
