import { WalletRepository } from '../wallet.repository';
import { WalletDto } from '../dto';
import { AuthenticatedContext } from '../../../common/auth/auth-context';
export declare class GetWalletUseCase {
    private readonly repo;
    constructor(repo: WalletRepository);
    execute(ctx: AuthenticatedContext, userId: string): Promise<WalletDto>;
}
