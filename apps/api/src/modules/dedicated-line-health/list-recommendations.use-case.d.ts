import { AuthenticatedContext } from '../../common/auth/auth-context';
export declare class ListDedicatedLineRecommendationsUseCase {
    execute(ctx: AuthenticatedContext): Promise<({
        dedicatedLine: {
            status: import("@ipeasy/db/generated/client").$Enums.DedicatedLineStatus;
            countryCode: string;
            id: string;
            desiredVersion: number;
        };
        sourceNode: {
            code: string;
            regionCode: string;
            id: string;
        };
        candidates: ({
            node: {
                status: import("@ipeasy/db/generated/client").$Enums.ControlNodeStatus;
                code: string;
                regionCode: string;
                id: string;
                capacityUnits: number;
                allocatedUnits: number;
            };
        } & {
            id: string;
            siteId: string;
            createdAt: Date;
            nodeId: string;
            reasonCode: string | null;
            recommendationId: string;
            rank: number;
            eligible: boolean;
        })[];
    } & {
        status: import("@ipeasy/db/generated/client").$Enums.MigrationRecommendationStatus;
        id: string;
        siteId: string;
        createdAt: Date;
        tenantId: string;
        userId: string;
        dedicatedLineId: string;
        migrationId: string | null;
        sourceNodeId: string;
        incidentVersion: number;
        reasonCode: string;
        reasonDetail: import("@ipeasy/db/generated/client/runtime/library").JsonValue | null;
        resolvedAt: Date | null;
    })[]>;
}
