export type MigrationType = 'NODE_ONLY' | 'EXIT_ONLY' | 'FULL';
export type MigrationPhase = 'PREPARE' | 'CANARY_ROUTE' | 'VERIFY' | 'CUTOVER_ROUTE' | 'COMMIT' | 'CLEANUP' | 'ROLLBACK';
export type MigrationStatus = 'ACTIVE' | 'NEEDS_OPERATOR' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
export type MigrationAllowedAction = 'IMPORT_CANARY' | 'QUEUE_VERIFY' | 'IMPORT_CUTOVER' | 'COMMIT' | 'RETRY' | 'CANCEL' | 'IMPORT_ROLLBACK';
export type MigrationState = {
    type: MigrationType;
    phase: MigrationPhase;
    status: MigrationStatus;
};
export type MigrationEvent = {
    type: 'TARGET_PROJECTIONS_READY';
} | {
    type: 'CANARY_ROUTE_IMPORTED';
} | {
    type: 'SMOKE_VERIFIED';
} | {
    type: 'CUTOVER_ROUTE_IMPORTED';
} | {
    type: 'COMMIT';
} | {
    type: 'CLEANUP_COMPLETED';
} | {
    type: 'CANCEL';
} | {
    type: 'ROLLBACK_ROUTE_IMPORTED';
};
export declare function computeNodeDelta(sourceIds: readonly string[], targetIds: readonly string[]): {
    retained: string[];
    reserve: string[];
    release: string[];
};
export declare function assertMigrationTransition(state: MigrationState, event: MigrationEvent): MigrationState;
