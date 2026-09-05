import { AuthenticatedContext } from '../../../common/auth/auth-context';
import { ProvidersRepository } from '../providers.repository';
import { ProviderRegistryService } from '../provider-registry.service';
import { ProviderAccountListItemDto } from '../dto';
/**
 * Lists provider accounts for the caller's site (PLATFORM_ADMIN only). The
 * response is a read model that excludes the encrypted credential; the secret
 * never leaves the backend. Capabilities are derived from the matching adapter.
 */
export declare class ListProvidersUseCase {
    private readonly repo;
    private readonly registry;
    constructor(repo: ProvidersRepository, registry: ProviderRegistryService);
    execute(ctx: AuthenticatedContext): Promise<ProviderAccountListItemDto[]>;
    private toListItem;
}
