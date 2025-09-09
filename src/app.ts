import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { globalLimiter } from './security/rateLimit';
import { HttpError } from './utils';
import reservations from './routes/reservations/reservations.routes';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // so req.ip is correct behind proxies
  app.use(helmet()); // for headers
  app.use(express.json({ limit: '10kb' }));
  // CORS: support multiple origins via comma-separated env and optional credentials
  const originEnv = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
  const origins = originEnv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const allowCredentials =
    process.env.CORS_CREDENTIALS === '1' ||
    process.env.CORS_CREDENTIALS === 'true';

  app.use(
    cors({
      origin: (origin, cb) => {
        // allow non-browser requests (no Origin) or allowed origins
        if (!origin) return cb(null, true);
        if (origins.includes(origin)) return cb(null, true);
        return cb(new Error(`CORS: origin ${origin} not allowed`));
      },
      credentials: allowCredentials,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );
  app.use(globalLimiter);

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/reservations', reservations);

  app.use(
    (
      err: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      const status = err instanceof HttpError ? err.status : 500;
      const message =
        err instanceof HttpError ? err.message : 'Internal server error';
      console.error(err); // log for server
      res.status(status).json({ error: message }); // safe JSON for client
    }
  );

  return app;
}
