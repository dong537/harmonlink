import { ManagedLineProjectionAdapter } from '../dedicated-line-projections/managed-line-projection.adapter';
export declare class ProcessControlNodeHealthUseCase {
    private readonly adapter;
    constructor(adapter: ManagedLineProjectionAdapter);
    execute(limit?: number): Promise<{
        nodes: number;
        observations: number;
        recommendations: number;
    }>;
}
