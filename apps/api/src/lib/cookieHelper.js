"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withYtDlpCookies = withYtDlpCookies;
const fs_1 = require("fs");
const path_1 = require("path");
const os_1 = require("os");
const crypto_1 = require("crypto");
/**
 * Decodes the YTDLP_COOKIES_B64 environment variable to a temporary file with secure permissions.
 * Passes the path to the provided action and ensures the file is securely deleted afterward.
 */
async function withYtDlpCookies(action) {
    const b64Cookies = process.env.YTDLP_COOKIES_B64?.trim();
    if (!b64Cookies) {
        return action(null);
    }
    const tmpDir = os_1.default.tmpdir();
    const fileName = `yt-dlp-cookies-${crypto_1.default.randomUUID()}.txt`;
    const filePath = path_1.default.join(tmpDir, fileName);
    try {
        const decoded = Buffer.from(b64Cookies, 'base64');
        fs_1.default.writeFileSync(filePath, decoded, { mode: 0o600 });
        return await action(filePath);
    }
    finally {
        if (fs_1.default.existsSync(filePath)) {
            try {
                fs_1.default.unlinkSync(filePath);
            }
            catch (e) {
                console.error(`[CookieHelper]: Failed to cleanup temp cookie file at ${filePath}`, e);
            }
        }
    }
}
