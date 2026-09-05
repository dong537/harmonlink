export type MigrationCleanupResult = {
    status: 'WAITING';
    migrationId: string;
} | {
    status: 'COMPLETED';
    migrationId: string;
    migrationStatus: 'COMPLETED' | 'CANCELLED';
};
export declare class ProcessMigrationCleanupUseCase {
    execute(migrationId: string): Promise<MigrationCleanupResult>;
}
