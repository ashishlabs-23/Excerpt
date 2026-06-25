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

if (!process.env.YTDLP_COOKIES_B64) {
  console.error('[Startup]: FATAL ERROR - YTDLP_COOKIES_B64 environment variable is missing.');
  console.error('[Startup]: Please configure YTDLP_COOKIES_B64 with the base64-encoded contents of your cookies.txt file.');
  process.exit(1);
}

import videoRoutes from './routes/video';
import voiceoverRoutes from './routes/voiceover';
import systemRoutes from './routes/system';
import tournamentRoutes from './routes/tournament';
import { startWorker } from './workers/videoWorker';
import { requestLogger } from './middleware/logging';
import { validateSystemOrExit } from './validation/systemValidator';
import http from 'http';
import { WebSocketService } from './services/WebSocketService';
import { ZombieSweeperService } from './services/ZombieSweeperService';

async function bootstrap() {
  // 1. Run strict system validations
  await validateSystemOrExit();

  // 2. Initialize the worker in the background
  startWorker().catch(console.error);
  
  // 3. Initialize Zombie Sweeper
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
app.use('/api/tournament', tournamentRoutes);

// Health Check
app.get('/health', (req: express.Request, res: express.Response) => {
  res.status(200).json({ status: 'OK', message: 'Excerpt API is live' });
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

server.listen(Number(PORT), () => {
    console.log(`[Server]: Excerpt API is running on port ${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('[Startup]: Failed to bootstrap application:', err);
  process.exit(1);
});
