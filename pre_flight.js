const { execSync } = require('child_process');
const http = require('http');

async function checkDep(name, cmd) {
  try {
    const out = execSync(cmd, { stdio: 'pipe' }).toString().trim();
    console.log(`[PASS] ${name} is installed. (${out.split('\n')[0].substring(0, 50)})`);
    return true;
  } catch (e) {
    console.log(`[FAIL] ${name} is missing or broken.`);
    return false;
  }
}

async function checkEndpoint(name, url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      if (res.statusCode === 200 || res.statusCode === 404 || res.statusCode === 401) { // 401/404 mean we hit a route and server is up
        console.log(`[PASS] ${name} is online (${url})`);
        resolve(true);
      } else {
        console.log(`[WARN] ${name} returned status ${res.statusCode} (${url})`);
        resolve(false);
      }
    });
    req.on('error', (e) => {
      console.log(`[FAIL] ${name} is unreachable (${url})`);
      resolve(false);
    });
    req.setTimeout(3000, () => {
      console.log(`[FAIL] ${name} timed out (${url})`);
      req.destroy();
      resolve(false);
    });
  });
}

async function run() {
  console.log('--- PRE-FLIGHT DEPENDENCY CHECK ---');
  let pass = true;
  
  pass = await checkDep('FFmpeg', 'ffmpeg -version') && pass;
  pass = await checkDep('FFprobe', 'ffprobe -version') && pass;
  pass = await checkDep('yt-dlp', 'yt-dlp --version') && pass;
  
  console.log('\n--- SERVICE HEALTH CHECK ---');
  pass = await checkEndpoint('API Backend', 'http://localhost:8010/api/system/quality-metrics') && pass;
  pass = await checkEndpoint('Frontend Web', 'http://localhost:3000') && pass;
  
  // Try supabase local status
  try {
    const sb = execSync('npx supabase status', { cwd: './apps/api', stdio: 'pipe' }).toString();
    console.log('[PASS] Supabase is running locally.');
  } catch (e) {
    console.log('[FAIL] Supabase local environment is down or command failed.');
    pass = false;
  }

  if (pass) {
    console.log('\n✅ ALL PRE-FLIGHT CHECKS PASSED');
    process.exit(0);
  } else {
    console.log('\n❌ PRE-FLIGHT CHECKS FAILED');
    process.exit(1);
  }
}

run();
