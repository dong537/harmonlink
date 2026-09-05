"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeNodeDelta = computeNodeDelta;
exports.assertMigrationTransition = assertMigrationTransition;
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
function computeNodeDelta(sourceIds, targetIds) {
    assertUniqueNodeIds(sourceIds);
    assertUniqueNodeIds(targetIds);
    const source = new Set(sourceIds);
    const target = new Set(targetIds);
    return {
        retained: targetIds.filter((id) => source.has(id)),
        reserve: targetIds.filter((id) => !source.has(id)),
        release: sourceIds.filter((id) => !target.has(id)),
    };
}
function assertMigrationTransition(state, event) {
    if (event.type === 'CANCEL')
        return cancel(state);
    if (event.type === 'CLEANUP_COMPLETED' && state.phase === 'CLEANUP' && state.status === 'CANCELLED')
        return state;
    if (state.status !== 'ACTIVE' && !(state.status === 'NEEDS_OPERATOR' && event.type === 'ROLLBACK_ROUTE_IMPORTED')) {
        invalidTransition();
    }
    switch (event.type) {
        case 'TARGET_PROJECTIONS_READY':
            if (state.phase !== 'PREPARE')
                invalidTransition();
            return next(state, state.type === 'EXIT_ONLY' ? 'VERIFY' : 'CANARY_ROUTE');
        case 'CANARY_ROUTE_IMPORTED':
            if (state.type === 'EXIT_ONLY' || state.phase !== 'CANARY_ROUTE')
                invalidTransition();
            return next(state, 'VERIFY');
        case 'SMOKE_VERIFIED':
            if (state.phase !== 'VERIFY')
                invalidTransition();
            return next(state, state.type === 'EXIT_ONLY' ? 'COMMIT' : 'CUTOVER_ROUTE');
        case 'CUTOVER_ROUTE_IMPORTED':
            if (state.type === 'EXIT_ONLY' || state.phase !== 'CUTOVER_ROUTE')
                invalidTransition();
            return next(state, 'COMMIT');
        case 'COMMIT':
            if (state.phase !== 'COMMIT')
                invalidTransition();
            return next(state, 'CLEANUP');
        case 'CLEANUP_COMPLETED':
            if (state.phase !== 'CLEANUP')
                invalidTransition();
            return { ...state, status: 'COMPLETED' };
        case 'ROLLBACK_ROUTE_IMPORTED':
            if (state.phase !== 'ROLLBACK' || state.status !== 'NEEDS_OPERATOR')
                invalidTransition();
            return { ...state, phase: 'CLEANUP', status: 'ACTIVE' };
    }
}
function cancel(state) {
    if (state.phase === 'COMMIT' || state.phase === 'CLEANUP') {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.IDEMPOTENCY_CONFLICT, 'migration_already_committed', 409);
    }
    if (state.status !== 'ACTIVE')
        invalidTransition();
    if (state.phase === 'PREPARE' || state.phase === 'CANARY_ROUTE' || (state.type === 'EXIT_ONLY' && state.phase === 'VERIFY')) {
        return { ...state, phase: 'CLEANUP', status: 'CANCELLED' };
    }
    return { ...state, phase: 'ROLLBACK', status: 'NEEDS_OPERATOR' };
}
function next(state, phase) {
    return { ...state, phase };
}
function assertUniqueNodeIds(nodeIds) {
    if (new Set(nodeIds).size !== nodeIds.length) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'migration_nodes_duplicate', 400);
    }
}
function invalidTransition() {
    throw new app_error_1.AppError(error_codes_1.ErrorCode.IDEMPOTENCY_CONFLICT, 'migration_phase_invalid', 409);
}
//# sourceMappingURL=domain.js.map