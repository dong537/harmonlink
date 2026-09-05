import { WalletRepository } from '../wallet/wallet.repository';
import type { ExpiredReservationCandidate, ExpiredReservationSource } from './domain';
export declare class ReclaimExpiredReservationsRepository implements ExpiredReservationSource {
    private readonly wallets;
    constructor(wallets: WalletRepository);
    findExpiredCandidates(now: Date, limit: number): Promise<ExpiredReservationCandidate[]>;
    reclaim(candidate: ExpiredReservationCandidate, now: Date): Promise<boolean>;
}
