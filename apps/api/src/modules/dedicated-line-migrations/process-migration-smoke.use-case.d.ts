import { Prisma } from '@ipeasy/db/generated/client';
import { MigrationSmokeAdapter } from './migration-smoke.adapter';
export declare class ProcessMigrationSmokeUseCase {
    private readonly adapter;
    constructor(adapter: MigrationSmokeAdapter);
    execute(migrationId: string, stage: 'CANARY' | 'CUTOVER' | 'ROLLBACK'): Promise<{
        id: string;
        siteId: string;
        tenantId: string;
        userId: string;
        dedicatedLineId: string;
        observedIp: string | null;
        observedCountryCode: string | null;
        latencyMs: number | null;
        failureType: string | null;
        observedAt: Date;
        freshUntil: Date;
        migrationId: string;
        hostname: string;
        stage: import("@ipeasy/db/generated/client").$Enums.MigrationSmokeStage;
        verified: boolean;
        failureDetail: Prisma.JsonValue | null;
    }>;
}
