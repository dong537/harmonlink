"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.managedLineProjectionDesiredHash = managedLineProjectionDesiredHash;
const node_crypto_1 = require("node:crypto");
function managedLineProjectionDesiredHash(request) {
    return (0, node_crypto_1.createHash)('sha256').update(JSON.stringify(request)).digest('hex');
}
//# sourceMappingURL=domain.js.map