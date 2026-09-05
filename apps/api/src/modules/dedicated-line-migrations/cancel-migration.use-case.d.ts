import { AuthenticatedContext } from '../../common/auth/auth-context';
export declare class CancelDedicatedLineMigrationUseCase {
    execute(ctx: AuthenticatedContext, migrationId: string): Promise<{
        migrationId: string;
        phase: import("./domain").MigrationPhase;
        status: import("./domain").MigrationStatus;
    }>;
}
