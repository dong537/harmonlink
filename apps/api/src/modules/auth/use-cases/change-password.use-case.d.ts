import { AuthRepository } from '../auth.repository';
import { AuthenticatedContext } from '../../../common/auth/auth-context';
export declare class ChangePasswordUseCase {
    private readonly authRepo;
    constructor(authRepo: AuthRepository);
    /**
     * Changes the calling USER's login password. Verifies the old password with
     * bcrypt.compare (uniform error that does not reveal whether the account or the
     * password was at fault), enforces a minimum strength on the new password,
     * re-hashes with a production cost, and revokes the user's other sessions so a
     * leaked session elsewhere cannot survive a password change. The current
     * session is kept so the active device stays signed in.
     */
    execute(ctx: AuthenticatedContext, currentSessionId: string, input: unknown): Promise<void>;
}
