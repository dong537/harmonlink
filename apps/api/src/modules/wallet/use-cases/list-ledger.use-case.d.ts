import { WalletRepository } from '../wallet.repository';
import { LedgerEntryDto } from '../dto';
import { AuthenticatedContext } from '../../../common/auth/auth-context';
import { PageQueryDto, PageResult } from '../../../common/pagination/pagination.dto';
import { LedgerEntryType } from '@ipeasy/db';
export declare class ListLedgerUseCase {
    private readonly repo;
    constructor(repo: WalletRepository);
    execute(ctx: AuthenticatedContext, userId: string, query: PageQueryDto & {
        type?: LedgerEntryType;
        from?: string;
        to?: string;
    }): Promise<PageResult<LedgerEntryDto>>;
}
