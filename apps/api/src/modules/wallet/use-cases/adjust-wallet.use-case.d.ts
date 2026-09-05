import { WalletRepository } from '../wallet.repository';
import { AdjustWalletDto, WalletDto } from '../dto';
import { AuthenticatedContext } from '../../../common/auth/auth-context';
export declare class AdjustWalletUseCase {
    private readonly repo;
    constructor(repo: WalletRepository);
    execute(ctx: AuthenticatedContext, userId: string, dto: AdjustWalletDto): Promise<WalletDto>;
}
