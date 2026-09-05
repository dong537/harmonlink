import { PrismaService } from '../../common/prisma/prisma.service';
export interface RenewDedicatedLineInput {
    lineId: string;
    durationDays: number;
    idempotencyKey: string;
}
export interface RenewDedicatedLineResult {
    orderId: string;
    totalPrice: string;
    currency: string;
}
export declare class RenewDedicatedLineUseCase {
    private readonly prisma;
    constructor(prisma: PrismaService);
    execute(input: RenewDedicatedLineInput): Promise<RenewDedicatedLineResult>;
}
