"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnsafeRemoteUrlError = void 0;
exports.assertSafeRemoteVideoUrl = assertSafeRemoteVideoUrl;
exports.fetchSecurely = fetchSecurely;
const validateVideoUrl_1 = require("../middleware/validateVideoUrl");
const https_1 = require("https");
const http_1 = require("http");
const net_1 = require("net");
const url_1 = require("url");
class UnsafeRemoteUrlError extends Error {
    constructor(message, code = 'invalid_video_url') {
        super(message);
        this.statusCode = 400;
        this.name = 'UnsafeRemoteUrlError';
        this.code = code;
    }
}
exports.UnsafeRemoteUrlError = UnsafeRemoteUrlError;
async function assertSafeRemoteVideoUrl(value, options = {}) {
    const result = await (0, validateVideoUrl_1.validateVideoUrl)(value, {
        enforceHostAllowlist: options.enforceHostPolicy !== false,
    });
    if (!result.ok) {
        const failed = result;
        throw new UnsafeRemoteUrlError(failed.message, failed.code);
    }
    return result.url;
}
async function fetchSecurely(urlStr, options = {}) {
    const result = await (0, validateVideoUrl_1.validateVideoUrl)(urlStr, {
        enforceHostAllowlist: options.enforceHostPolicy !== false,
    });
    if (!result.ok) {
        const failed = result;
        throw new UnsafeRemoteUrlError(failed.message, failed.code);
    }
    const resolvedIp = result.resolvedAddresses[0];
    if (!resolvedIp) {
        throw new Error('No IP address resolved for the safe URL.');
    }
    const parsedUrl = new url_1.URL(result.url);
    const lib = parsedUrl.protocol === 'https:' ? https_1.default : http_1.default;
    return new Promise((resolve, reject) => {
        const req = lib.get(result.url, {
            headers: {
                'Host': parsedUrl.hostname,
                'User-Agent': 'Mozilla/5.0 Excerpt',
            },
            signal: options.signal,
            lookup: (hostname, opt, callback) => {
                // Detect IPv4 vs IPv6 dynamically to avoid ERR_INVALID_IP_ADDRESS
                const ipFamily = net_1.default.isIP(resolvedIp) === 6 ? 6 : 4;
                callback(null, resolvedIp, ipFamily); // Pin DNS lookup to the pre-validated IP
            },
        }, (res) => {
            const headers = {};
            for (const [key, val] of Object.entries(res.headers)) {
                if (val !== undefined) {
                    headers[key] = Array.isArray(val) ? val.join(', ') : val;
                }
            }
            resolve({
                statusCode: res.statusCode,
                statusText: res.statusMessage,
                headers,
                body: res,
            });
        });
        req.on('error', (err) => {
            reject(err);
        });
    });
}
