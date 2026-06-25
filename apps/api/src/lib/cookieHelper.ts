import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

/**
 * Decodes the YTDLP_COOKIES_B64 environment variable to a temporary file with secure permissions.
 * Passes the path to the provided action and ensures the file is securely deleted afterward.
 */
export async function withYtDlpCookies<T>(
  action: (cookiesPath: string | null) => Promise<T>
): Promise<T> {
  const b64Cookies = process.env.YTDLP_COOKIES_B64?.trim();
  
  if (!b64Cookies) {
    return action(null);
  }

  const tmpDir = os.tmpdir();
  const fileName = `yt-dlp-cookies-${crypto.randomUUID()}.txt`;
  const filePath = path.join(tmpDir, fileName);

  try {
    const decoded = Buffer.from(b64Cookies, 'base64');
    fs.writeFileSync(filePath, decoded, { mode: 0o600 });
    return await action(filePath);
  } finally {
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        console.error(`[CookieHelper]: Failed to cleanup temp cookie file at ${filePath}`, e);
      }
    }
  }
}
