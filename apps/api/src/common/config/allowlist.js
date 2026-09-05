"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAllowlist = parseAllowlist;
exports.allows = allows;
exports.allowsAny = allowsAny;
function parseAllowlist(value) {
    return new Set(value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean));
}
function allows(value, allowlistValue) {
    const allowlist = parseAllowlist(allowlistValue);
    return allowlist.size > 0 && value !== undefined && allowlist.has(value);
}
function allowsAny(candidates) {
    return candidates.some((candidate) => allows(candidate.value, candidate.allowlist));
}
//# sourceMappingURL=allowlist.js.map