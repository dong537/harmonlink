import { GetWalletUseCase } from './use-cases/get-wallet.use-case';
import { ListLedgerUseCase } from './use-cases/list-ledger.use-case';
import { AdjustWalletUseCase } from './use-cases/adjust-wallet.use-case';
import { AdjustWalletDto, WalletDto, LedgerEntryDto } from './dto';
import { AuthenticatedContext } from '../../common/auth/auth-context';
import { PageQueryDto, PageResult } from '../../common/pagination/pagination.dto';
import { LedgerEntryType } from '@ipeasy/db';
export declare class WalletController {
    private readonly getWallet;
    private readonly listLedger;
    private readonly adjustWallet;
    constructor(getWallet: GetWalletUseCase, listLedger: ListLedgerUseCase, adjustWallet: AdjustWalletUseCase);
    get(ctx: AuthenticatedContext, userId: string): Promise<WalletDto>;
    ledger(ctx: AuthenticatedContext, userId: string, query: PageQueryDto & {
        type?: LedgerEntryType;
        from?: string;
        to?: string;
    }): Promise<PageResult<LedgerEntryDto>>;
    adjust(ctx: AuthenticatedContext, userId: string, body: AdjustWalletDto): Promise<WalletDto>;
}
