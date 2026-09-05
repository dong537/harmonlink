import { AuthenticatedContext } from '../../common/auth/auth-context';
import { MigrationAllowedAction } from './domain';
export declare class ListDedicatedLineMigrationsUseCase {
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
        allowedActions: MigrationAllowedAction[];
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
        allowedActions: MigrationAllowedAction[];
        lastErrorCode: string | null;
        lastErrorDetail: unknown;
        retryCount: number;
        createdAt: Date;
        updatedAt: Date;
        committedAt: Date | null;
        finishedAt: Date | null;
    } | null>;
}
