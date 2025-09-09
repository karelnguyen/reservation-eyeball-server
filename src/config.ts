import 'dotenv/config';

/** Required env helper */
function must(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

/** Parse integer envs with a default (minutes/ports, etc.) */
function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const CONFIG = {
  // Required secrets/env
  PIN_SECRET: must('PIN_SECRET'),
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  PORT: intFromEnv('PORT', 4000),

  /**
   * How long a PIN is valid after the scheduled time if there is NO queue.
   * (We also extend this if the queue pushes your expected start later.)
   */
  PIN_VALID_TIME: intFromEnv('PIN_VALID_TIME', 15), // minutes

  /**
   * Extra time added beyond the computed expectedStart from the queue.
   * Example: if expectedStart is 10:10, we allow PIN until ~10:20.
   */
  EXTRA_TIME: intFromEnv('EXTRA_TIME', 10), // minutes

  /**
   * Absolute cap — even with a huge queue, don't extend more than this
   * many minutes past the scheduled time.
   */
  MAX_EXTENSION_TIME: intFromEnv('MAX_EXTENSION_TIME', 60), // minutes

  /** Average service time per reservation for queue model */
  SERVICE_TIME: intFromEnv('SERVICE_TIME', 5), // minutes
} as const;

/** Convenience: convert minutes to ms */
export const MIN = (m: number) => m * 60_000;
