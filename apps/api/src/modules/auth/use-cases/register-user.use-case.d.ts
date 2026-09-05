import { AuthRepository } from '../auth.repository';
import { RegisterResponseDto } from '../dto';
import { ConfigService } from '../../../common/config/config.service';
export declare class RegisterUserUseCase {
    private readonly authRepo;
    private readonly config;
    constructor(authRepo: AuthRepository, config: ConfigService);
    /**
     * Self-service customer signup. Validates email shape and password strength,
     * rejects duplicate accounts (without leaking which field collided), lands the
     * user in the site's default signup tenant, then creates the user + zero-balance
     * wallet + audit row in one transaction and returns a session so the new user is
     * logged in immediately.
     */
    execute(input: unknown): Promise<RegisterResponseDto>;
}
