import { AuthenticatedContext } from '../../common/auth/auth-context';
import { ConfigService } from '../../common/config/config.service';
export declare class CommitDedicatedLineMigrationUseCase {
    private readonly config;
    constructor(config: ConfigService);
    execute(ctx: AuthenticatedContext, migrationId: string): Promise<{
        migrationId: string;
        phase: string;
        status: string;
    }>;
}
