import { AuthenticatedContext } from './auth-context';
import { AuthRepository } from '../../modules/auth/auth.repository';
export declare class JwtStrategy {
    private readonly authRepo;
    constructor(authRepo: AuthRepository);
    authenticate(bearerToken: string): Promise<AuthenticatedContext & {
        sessionId: string;
    }>;
}
