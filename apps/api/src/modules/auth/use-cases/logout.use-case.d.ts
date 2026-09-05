import { AuthRepository } from '../auth.repository';
import { AuthenticatedContext } from '../../../common/auth/auth-context';
export declare class LogoutUseCase {
    private readonly authRepo;
    constructor(authRepo: AuthRepository);
    execute(ctx: AuthenticatedContext, sessionId: string): Promise<void>;
}
