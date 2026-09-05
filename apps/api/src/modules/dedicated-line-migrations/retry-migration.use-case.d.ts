import { AuthenticatedContext } from '../../common/auth/auth-context';
export declare class RetryDedicatedLineMigrationUseCase {
    execute(ctx: AuthenticatedContext, migrationId: string, body: unknown): Promise<{
        migrationId: string;
        phase: "PREPARE" | "CANARY_ROUTE" | "VERIFY" | "CUTOVER_ROUTE" | "COMMIT" | "CLEANUP";
        status: string;
        requeuedJobs: number;
    }>;
}
