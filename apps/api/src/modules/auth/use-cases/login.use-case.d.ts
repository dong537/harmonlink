import { AuthRepository } from '../auth.repository';
import { LoginResponseDto } from '../dto';
export type LoginIdentity = {
    ownerType: 'USER' | 'ADMIN_USER';
    ownerId: string;
    siteId: string;
    tenantId: string | null;
    email: string;
    name: string | null;
    role: string;
};
export type LegacyLoginResult = {
    token: string;
    expiresAt: Date;
    refreshToken: string;
    identity: LoginIdentity;
};
export declare class LoginUseCase {
    private readonly authRepo;
    constructor(authRepo: AuthRepository);
    execute(input: unknown): Promise<LoginResponseDto>;
    executeLegacy(input: unknown, expectedOwnerType: 'USER' | 'ADMIN_USER'): Promise<LegacyLoginResult>;
    /**
     * Shape validation lives here rather than in a controller because this is the
     * single funnel for both `/api/auth/login` and the legacy `/api/v1/auth/*`
     * entry points. There is no global ValidationPipe, so an unvalidated body
     * previously reached `bcrypt.compare(undefined, hash)`, which throws a plain
     * Error and surfaced as a 500 instead of a 400.
     *
     * Field-shape failures are 400. Credential mismatch stays 401
     * `invalid_credentials` and is deliberately identical for unknown email and
     * wrong password, so neither status nor reasonKey can be used to enumerate
     * accounts.
     */
    private parseCredentials;
    private authenticate;
    private auditLogin;
}
