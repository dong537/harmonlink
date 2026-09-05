"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectPriceCandidate = selectPriceCandidate;
function selectPriceCandidate(candidateSets, currency) {
    for (const set of candidateSets) {
        if (set.candidates.length === 0)
            continue;
        const candidate = set.candidates.find((item) => item.currency === currency);
        if (candidate)
            return candidate;
        if (set.hasCurrencyMismatch)
            return 'CURRENCY_MISMATCH';
    }
    return null;
}
//# sourceMappingURL=domain.js.map