"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptAesGcm = encryptAesGcm;
exports.decryptAesGcm = decryptAesGcm;
const crypto_1 = require("crypto");
// Format: iv:authTag:ciphertext (all hex) — same as provider credential encryption
function encryptAesGcm(plaintext, keyHex) {
    const key = Buffer.from(keyHex.slice(0, 64), 'hex');
    const iv = (0, crypto_1.randomBytes)(12);
    const cipher = (0, crypto_1.createCipheriv)('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}
function decryptAesGcm(encrypted, keyHex) {
    const parts = encrypted.split(':');
    if (parts.length !== 3)
        throw new Error('invalid_encrypted_format');
    const [ivHex, authTagHex, ciphertextHex] = parts;
    const key = Buffer.from(keyHex.slice(0, 64), 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');
    const decipher = (0, crypto_1.createDecipheriv)('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
//# sourceMappingURL=aes-gcm.js.map