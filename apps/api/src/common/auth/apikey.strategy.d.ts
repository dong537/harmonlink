import { AuthenticatedContext } from './auth-context';
import { ApiKeysRepository } from '../../modules/api-keys/api-keys.repository';
export declare class ApiKeyStrategy {
    private readonly apiKeysRepo;
    constructor(apiKeysRepo: ApiKeysRepository);
    authenticate(rawKey: string, clientIp: string): Promise<AuthenticatedContext>;
}
