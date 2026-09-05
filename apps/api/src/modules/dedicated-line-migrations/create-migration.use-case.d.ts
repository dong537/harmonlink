import { AuthenticatedContext } from '../../common/auth/auth-context';
import { DedicatedLineMigrationSummary } from './dto';
import { ConfigService } from '../../common/config/config.service';
export declare class CreateDedicatedLineMigrationUseCase {
    private readonly config;
    constructor(config: ConfigService);
    execute(ctx: AuthenticatedContext, lineId: string, body: unknown): Promise<DedicatedLineMigrationSummary>;
}
