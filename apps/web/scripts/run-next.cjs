const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const webDir = path.resolve(__dirname, "..");
const mode = process.argv[2] || "dev";
const extraArgs = process.argv.slice(3);

function clearNextCache() {
  const nextDir = path.join(webDir, ".next");
  if (!fs.existsSync(nextDir)) {
    return;
  }

  try {
    fs.rmSync(nextDir, { recursive: true, force: true });
    console.log("[web] Cleared stale .next cache before startup.");
  } catch (error) {
    console.warn(`[web] Could not clear .next cache: ${error.message}`);
  }
}

if (mode === "dev") {
  clearNextCache();
}

const env = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED || "1",
};

delete env.NEXT_PRIVATE_LOCAL_WEBPACK;

const nextBin = require.resolve("next/dist/bin/next", {
  paths: [webDir],
});

const child = spawn(process.execPath, [nextBin, mode, ...extraArgs], {
  cwd: webDir,
  env,
  stdio: "inherit",
  windowsHide: false,
});

child.on("error", (error) => {
  console.error(`[web] Failed to start Next.js (${mode}): ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
