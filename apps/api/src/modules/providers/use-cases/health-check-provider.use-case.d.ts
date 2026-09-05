import { AuthenticatedContext } from '../../../common/auth/auth-context';
import { ProvidersRepository } from '../providers.repository';
import { ProviderRegistryService } from '../provider-registry.service';
import { ProviderHealthCheckResultDto } from '../dto';
/**
 * Runs a live connectivity probe against one provider account (PLATFORM_ADMIN
 * only). The result is never persisted — this is an on-demand probe.
 *
 * Error model:
 *  - permission / ownership errors throw (403 / NOT_FOUND) BEFORE the probe, so
 *    a cross-site id is indistinguishable from a missing one.
 *  - any failure of the probe itself (decrypt, adapter lookup, unreachable,
 *    timeout, upstream, unsafe base URL) converges into `reachable: false` +
 *    a stable `reasonKey`.
 *    It must never surface as a 500.
 */
export declare class HealthCheckProviderUseCase {
    private readonly repo;
    private readonly registry;
    private readonly logger;
    constructor(repo: ProvidersRepository, registry: ProviderRegistryService);
    execute(ctx: AuthenticatedContext, id: string): Promise<ProviderHealthCheckResultDto>;
    private probe;
    private writeAudit;
    private tryWriteAudit;
}
