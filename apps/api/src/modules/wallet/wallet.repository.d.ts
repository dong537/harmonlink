import { prisma, Prisma, LedgerEntryType } from '@ipeasy/db';
import { PageQueryDto, PageResult } from '../../common/pagination/pagination.dto';
export type Wallet = Prisma.walletsGetPayload<Record<string, never>>;
export type LedgerEntry = Prisma.ledger_entriesGetPayload<Record<string, never>>;
type PrismaTransactionClient = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;
export declare class WalletRepository {
    getWalletByUserId(userId: string, siteId: string, tenantId?: string | null): Promise<Wallet>;
    listLedgerEntries(walletId: string, tenantId: string, query: PageQueryDto & {
        type?: LedgerEntryType;
        from?: string;
        to?: string;
    }): Promise<PageResult<LedgerEntry>>;
    creditWalletTx(tx: PrismaTransactionClient, walletId: string, amount: string, currency: string, type: LedgerEntryType, relatedId: string, reason: string, idempotencyKey: string): Promise<LedgerEntry>;
    debitWalletTx(tx: PrismaTransactionClient, walletId: string, amount: string, currency: string, type: LedgerEntryType, relatedId: string, reason: string, idempotencyKey: string): Promise<LedgerEntry>;
}
export {};
