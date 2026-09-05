import { ConfigService } from '../../common/config/config.service';
export type MigrationSmokeResult = {
    verified: boolean;
    observedIp: string | null;
    observedCountry: string | null;
    latencyMs: number | null;
    stabilitySamples: number;
    failureCode: string | null;
    detail: Record<string, unknown>;
};
export declare class MigrationSmokeAdapter {
    private readonly config;
    private readonly fetchImpl;
    constructor(config: ConfigService, fetchImpl: typeof fetch);
    verify(hostname: string, port: number): Promise<MigrationSmokeResult>;
}
