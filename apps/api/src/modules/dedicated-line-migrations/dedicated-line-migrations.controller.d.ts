import { AuthenticatedContext } from '../../common/auth/auth-context';
import { CreateDedicatedLineMigrationUseCase } from './create-migration.use-case';
import { CommitDedicatedLineMigrationUseCase } from './commit-migration.use-case';
import { CancelDedicatedLineMigrationUseCase } from './cancel-migration.use-case';
import { ListDedicatedLineMigrationsUseCase } from './list-migrations.use-case';
import { RetryDedicatedLineMigrationUseCase } from './retry-migration.use-case';
import { ListDedicatedLineRecommendationsUseCase } from '../dedicated-line-health/list-recommendations.use-case';
export declare class DedicatedLineMigrationsController {
    private readonly createMigration;
    private readonly commitMigration;
    private readonly cancelMigration;
    private readonly retryMigration;
    private readonly listMigrations;
    private readonly recommendations;
    constructor(createMigration: CreateDedicatedLineMigrationUseCase, commitMigration: CommitDedicatedLineMigrationUseCase, cancelMigration: CancelDedicatedLineMigrationUseCase, retryMigration: RetryDedicatedLineMigrationUseCase, listMigrations: ListDedicatedLineMigrationsUseCase, recommendations: ListDedicatedLineRecommendationsUseCase);
    recommendationsList(ctx: AuthenticatedContext): Promise<({
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
    list(ctx: AuthenticatedContext, lineId: string): Promise<{
        id: string;
        lineId: string;
        type: "NODE_ONLY" | "EXIT_ONLY" | "FULL";
        phase: string;
        status: string;
        sourceLineVersion: number;
        targetLineVersion: number;
        sourceExitId: string;
        targetExitId: string | null;
        sourcePlacementId: string;
        targetPlacementId: string | null;
        sourceNodes: {
            id: string;
            code: string;
            regionCode: string;
            reservationStatus: string;
        }[];
        targetNodes: {
            id: string;
            code: string;
            regionCode: string;
            reservationStatus: string;
            projectionId: string | null;
        }[];
        domains: {
            hostname: string;
            port: number;
            role: string;
        }[];
        smokeObservations: {
            id: string;
            stage: string;
            hostname: string;
            verified: boolean;
            observedIp: string | null;
            observedCountryCode: string | null;
            latencyMs: number | null;
            failureType: string | null;
            observedAt: Date;
            freshUntil: Date;
        }[];
        routes: {
            canary: {
                id: string;
                sourceName: string;
                sourceVersion: string;
                capturedAt: Date;
            } | null;
            cutover: {
                id: string;
                sourceName: string;
                sourceVersion: string;
                capturedAt: Date;
            } | null;
            rollback: {
                id: string;
                sourceName: string;
                sourceVersion: string;
                capturedAt: Date;
            } | null;
        };
        allowedActions: import("./domain").MigrationAllowedAction[];
        lastErrorCode: string | null;
        lastErrorDetail: unknown;
        retryCount: number;
        createdAt: Date;
        updatedAt: Date;
        committedAt: Date | null;
        finishedAt: Date | null;
    }[]>;
    get(ctx: AuthenticatedContext, migrationId: string): Promise<{
        id: string;
        lineId: string;
        type: "NODE_ONLY" | "EXIT_ONLY" | "FULL";
        phase: string;
        status: string;
        sourceLineVersion: number;
        targetLineVersion: number;
        sourceExitId: string;
        targetExitId: string | null;
        sourcePlacementId: string;
        targetPlacementId: string | null;
        sourceNodes: {
            id: string;
            code: string;
            regionCode: string;
            reservationStatus: string;
        }[];
        targetNodes: {
            id: string;
            code: string;
            regionCode: string;
            reservationStatus: string;
            projectionId: string | null;
        }[];
        domains: {
            hostname: string;
            port: number;
            role: string;
        }[];
        smokeObservations: {
            id: string;
            stage: string;
            hostname: string;
            verified: boolean;
            observedIp: string | null;
            observedCountryCode: string | null;
            latencyMs: number | null;
            failureType: string | null;
            observedAt: Date;
            freshUntil: Date;
        }[];
        routes: {
            canary: {
                id: string;
                sourceName: string;
                sourceVersion: string;
                capturedAt: Date;
            } | null;
            cutover: {
                id: string;
                sourceName: string;
                sourceVersion: string;
                capturedAt: Date;
            } | null;
            rollback: {
                id: string;
                sourceName: string;
                sourceVersion: string;
                capturedAt: Date;
            } | null;
        };
        allowedActions: import("./domain").MigrationAllowedAction[];
        lastErrorCode: string | null;
        lastErrorDetail: unknown;
        retryCount: number;
        createdAt: Date;
        updatedAt: Date;
        committedAt: Date | null;
        finishedAt: Date | null;
    } | null>;
    create(ctx: AuthenticatedContext, lineId: string, body: unknown): Promise<import("./dto").DedicatedLineMigrationSummary>;
    commit(ctx: AuthenticatedContext, migrationId: string): Promise<{
        migrationId: string;
        phase: string;
        status: string;
    }>;
    cancel(ctx: AuthenticatedContext, migrationId: string): Promise<{
        migrationId: string;
        phase: import("./domain").MigrationPhase;
        status: import("./domain").MigrationStatus;
    }>;
    retry(ctx: AuthenticatedContext, migrationId: string, body: unknown): Promise<{
        migrationId: string;
        phase: "PREPARE" | "CANARY_ROUTE" | "VERIFY" | "CUTOVER_ROUTE" | "COMMIT" | "CLEANUP";
        status: string;
        requeuedJobs: number;
    }>;
}
