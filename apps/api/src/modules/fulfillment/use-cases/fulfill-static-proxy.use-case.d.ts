import { ProviderRegistryService } from '../../providers/provider-registry.service';
import { WalletRepository } from '../../wallet/wallet.repository';
import { FulfillmentRepository } from '../fulfillment.repository';
import { ProxiesRepository } from '../../proxies/proxies.repository';
import { ConfigService } from '../../../common/config/config.service';
export type FulfillmentExecutionResult = {
    status: 'NOOP';
    jobId: string;
} | {
    status: 'COMPLETED';
    jobId: string;
    orderId: string;
} | {
    status: 'RETRYING';
    jobId: string;
    orderId: string;
    attempts: number;
    error: string;
} | {
    status: 'FAILED_REFUNDED';
    jobId: string;
    orderId: string;
    attempts: number;
    error: string;
};
export declare class FulfillStaticProxyUseCase {
    private readonly fulfillmentRepo;
    private readonly providerRegistry;
    private readonly walletRepo;
    private readonly proxiesRepo;
    private readonly config;
    constructor(fulfillmentRepo: FulfillmentRepository, providerRegistry: ProviderRegistryService, walletRepo: WalletRepository, proxiesRepo: ProxiesRepository, config: ConfigService);
    execute(jobId: string): Promise<FulfillmentExecutionResult>;
}
