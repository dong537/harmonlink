import { AuthenticatedContext } from '../../common/auth/auth-context';
import { WalletRepository, Wallet } from './wallet.repository';
export declare function getWalletForContext(repo: WalletRepository, ctx: AuthenticatedContext, userId: string): Promise<Wallet>;
export declare function requireTenantId(ctx: AuthenticatedContext): string;
