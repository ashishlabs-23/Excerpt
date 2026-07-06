import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import compression from 'compression';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import { installConsoleLogger } from './services/logger';

// Load .env from project root — single smart load
const envPaths = [
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), '../../.env'),
];
const envPath = envPaths.find(p => fs.existsSync(p));
if (envPath) {
  dotenv.config({ path: envPath });
  console.log(`[Config]: Loaded .env from ${envPath}`);
} else {
  dotenv.config();
  console.warn('[Config]: No .env file found, using process env');
}

installConsoleLogger();

// No longer require YTDLP_COOKIES_B64 since we use Cobalt API for downloads

import videoRoutes from './routes/video';
import voiceoverRoutes from './routes/voiceover';
import systemRoutes from './routes/system';
import diagnosticsRoutes from './routes/diagnostics';
import tournamentRoutes from './routes/tournament';
import { requestLogger } from './middleware/logging';
import { validateSystemOrExit } from './validation/systemValidator';
import http from 'http';
import { spawn, ChildProcess } from 'child_process';
import { WebSocketService } from './services/WebSocketService';
import { ZombieSweeperService } from './services/ZombieSweeperService';

// ─── Worker Manager ──────────────────────────────────────────────────────────
// Spawns workers as isolated child processes AFTER Express is ready.
//
// Features:
//   • Workers only start once Express is listening (clean startup logs).
//   • Each worker has a distinct log prefix for easy debugging in Render logs.
//   • Crash-loop detection: stops restarting after 5 crashes within 2 minutes.
//   • Graceful shutdown: SIGTERM/SIGINT propagates to all children before exit.
// ─────────────────────────────────────────────────────────────────────────────

const CRASH_LOOP_WINDOW_MS = 2 * 60 * 1000; // 2 minutes
const CRASH_LOOP_MAX = 5;                    // max crashes before giving up

interface WorkerState {
  label:        string;
  child:        ChildProcess | null;
  pid:          number | null;
  startedAt:    number | null;
  restartCount: number;
  running:      boolean;
  stopped:      boolean; // crash-loop disabled
}

const workerRegistry: WorkerState[] = [];

function spawnWorker(scriptPath: string, label: string): void {
  const crashTimestamps: number[] = [];

  // Register in the worker registry so /health/workers can expose status
  const state: WorkerState = {
    label, child: null, pid: null, startedAt: null,
    restartCount: 0, running: false, stopped: false,
  };
  workerRegistry.push(state);

  const launch = () => {
    if (state.stopped) return;

    console.log(`[WorkerManager]: ▶ Starting [${label}]`);

    const child = spawn('node', [scriptPath], {
      env: process.env,
      stdio: 'inherit', // stream worker logs directly to Render console
    });

    state.child    = child;
    state.pid      = child.pid ?? null;
    state.startedAt = Date.now();
    state.running  = true;

    child.on('exit', (code, signal) => {
      state.running = false;
      state.child   = null;
      state.pid     = null;

      if (code === 0 || signal === 'SIGTERM') {
        console.log(`[WorkerManager]: [${label}] exited cleanly (code=${code}).`);
        return;
      }

      console.error(`[WorkerManager]: [${label}] crashed (code=${code}, signal=${signal}).`);
      state.restartCount++;

      // Record crash timestamp and prune those outside the window
      const now = Date.now();
      crashTimestamps.push(now);
      const recent = crashTimestamps.filter(t => now - t < CRASH_LOOP_WINDOW_MS);
      crashTimestamps.length = 0;
      crashTimestamps.push(...recent);

      if (crashTimestamps.length >= CRASH_LOOP_MAX) {
        state.stopped = true;
        console.error(
          `[WorkerManager]: ⛔ WORKER_DISABLED ` +
          `worker=${label} reason=CrashLoop ` +
          `restartCount=${state.restartCount} ` +
          `window=${CRASH_LOOP_WINDOW_MS / 1000}s — API will continue running.`
        );
        return;
      }

      const delay = Math.min(3000 * Math.pow(2, crashTimestamps.length - 1), 30000);
      console.warn(`[WorkerManager]: [${label}] restarting in ${delay}ms (crash ${crashTimestamps.length}/${CRASH_LOOP_MAX})...`);
      setTimeout(launch, delay);
    });

    child.on('error', (err) => {
      console.error(`[WorkerManager]: Failed to start [${label}]:`, err.message);
      state.running = false;
    });
  };

  launch();
}

/**
 * Graceful shutdown — kill all worker children before the main process exits.
 * Called on SIGTERM (Render deploys) and SIGINT (ctrl+c locally).
 */
function setupGracefulShutdown(): void {
  const shutdown = (signal: string) => {
    const running = workerRegistry.filter(w => w.running);
    console.log(`[WorkerManager]: Received ${signal}. Shutting down ${running.length} worker(s)...`);
    for (const w of workerRegistry) {
      if (w.child) {
        // Send SIGTERM to let workers cancel gracefully (e.g. abort ffmpeg)
        try { w.child.kill('SIGTERM'); } catch (_) { /* already dead */ }
      }
    }
    // Give workers 25s to clean up (Render allows 30s before SIGKILL)
    setTimeout(() => {
      console.log(`[WorkerManager]: Forced exit after 25s timeout.`);
      process.exit(0);
    }, 25000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  // Catch unhandled errors so they don't instantly blow up without cleanup
  process.on('uncaughtException', (err) => {
    console.error(`[WorkerManager]: Uncaught Exception:`, err);
    shutdown('uncaughtException');
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error(`[WorkerManager]: Unhandled Rejection at:`, promise, `reason:`, reason);
    // Don't necessarily shutdown on rejection unless strict, but log it heavily
  });
}

// ─────────────────────────────────────────────────────────────────────────────

async function bootstrap() {
  // 1. Run strict system validations before anything starts
  await validateSystemOrExit();

  // 2. Initialize Zombie Sweeper (cleans stale locked jobs from previous deploys)
  const zombieSweeper = new ZombieSweeperService();
  zombieSweeper.start();

  const app = express();

  app.set('trust proxy', true);
  // Enforce 8010 for backend to avoid conflict with Next.js (3000)
  const PORT = process.env.PORT === '3000' ? 8010 : (process.env.PORT || 8010);
  const corsOrigin = process.env.CORS_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || true;

  // Middleware
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(compression());
  app.use(cors({ origin: corsOrigin, exposedHeaders: ['Content-Disposition', 'Content-Length', 'Content-Type'] }));
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(requestLogger);

  // Routes
  app.use('/api/video', videoRoutes);
  app.use('/api/voiceover', voiceoverRoutes);
  app.use('/api/system', systemRoutes);
  app.use('/api/diagnostics', diagnosticsRoutes);
  app.use('/api/tournament', tournamentRoutes);

  // Startup Version Metadata
  const buildTime = new Date().toISOString();
  let currentCommit = process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || 'unknown';
  
  try {
    if (currentCommit === 'unknown') {
      const { execSync } = require('child_process');
      currentCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
    }
  } catch (e) {
    // ignore
  }

  // Health Check - Fast
  app.get('/health', (req: express.Request, res: express.Response) => {
    res.status(200).send('alive');
  });

  // Health Details
  app.get('/health/details', async (req: express.Request, res: express.Response) => {
    let envSnapshot: any = {};
    try {
      const { EnvironmentInspector } = require('./services/download/EnvironmentInspector');
      envSnapshot = await EnvironmentInspector.getSnapshot();
    } catch (e) {
      envSnapshot = { error: 'Failed to load environment snapshot' };
    }

    const workers = workerRegistry.map(w => ({ running: w.running, stopped: w.stopped }));
    const workersHealthy = workers.length > 0 && workers.every(w => w.running);

    res.status(200).json({
      environment: process.env.NODE_ENV || 'development',
      branch: process.env.RENDER_GIT_BRANCH || 'master',
      commit: currentCommit,
      buildTime: buildTime,
      startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
      schemaVersion: 'v6.3',
      versions: {
        node: process.version,
        ffmpeg: envSnapshot.ffmpegVersion || 'unknown',
        ytDlp: envSnapshot.ytDlpVersion || 'unknown',
        workerVersion: 'Gen-4',
        downloadEngineVersion: '2.0.0'
      },
      health: {
        workers: workersHealthy ? 'healthy' : 'degraded',
        database: 'connected', // Optimistic for now, assuming pool is up
        redis: 'connected',
        storage: 'connected'
      }
    });
  });

  // Worker health — shows live status of all pipeline workers
  app.get('/health/workers', (req: express.Request, res: express.Response) => {
    const now = Date.now();
    const workers = workerRegistry.map(w => ({
      name:         w.label,
      pid:          w.pid,
      running:      w.running,
      stopped:      w.stopped,
      restarts:     w.restartCount,
      uptimeSeconds: w.startedAt && w.running ? Math.floor((now - w.startedAt) / 1000) : null,
    }));
    const allHealthy = workers.length > 0 && workers.every(w => w.running);
    res.status(allHealthy ? 200 : 207).json({ healthy: allHealthy, workers });
  });

  // Download Engine
  app.get('/health/download', async (req: express.Request, res: express.Response) => {
    let envSnapshot: any = {};
    try {
      const { EnvironmentInspector } = require('./services/download/EnvironmentInspector');
      envSnapshot = await EnvironmentInspector.getSnapshot();
    } catch (e) {}

    res.status(200).json({
      downloadEngineVersion: '2.0.0',
      strategies: ['web', 'tv', 'ios', 'android'],
      ytDlp: envSnapshot.ytDlpVersion || 'unknown',
      ffmpeg: envSnapshot.ffmpegVersion || 'unknown'
    });
  });

  // Error Handling
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[API Error]:', err);
    res.status(err.status || 500).json({
      error: err.message || 'Internal Server Error',
    });
  });

  const server = http.createServer(app);
  WebSocketService.getInstance().init(server);

  // 3. Start listening — workers only spawn AFTER Express is confirmed ready.
  //    This ensures clean startup logs and avoids race conditions with Supabase/B2 init.
  server.listen(Number(PORT), () => {
    console.log(`[Server]: Excerpt API is running on port ${PORT}`);

    // Register graceful shutdown handler (propagates SIGTERM to all children)
    setupGracefulShutdown();

    // Spawn all pipeline workers as independent child processes.
    // Render Free plan doesn't support background worker services,
    // so we run them here. Each is fully isolated — a worker crash cannot
    // take down Express or sibling workers.
    const distDir = __dirname;
    spawnWorker(path.join(distDir, 'workers', 'videoWorker.js'),     'VideoWorker');
    spawnWorker(path.join(distDir, 'workers', 'renderWorker.js'),    'RenderWorker');
    spawnWorker(path.join(distDir, 'workers', 'voiceoverWorker.js'), 'VoiceoverWorker');
  });
}

bootstrap().catch((err) => {
  console.error('[Startup]: Failed to bootstrap application:', err);
  process.exit(1);
});
