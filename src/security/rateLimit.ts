import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

// Generic JSON 429 handler
function json429(_: Request, __: any) {
  return {
    error: 'Too many requests. Please try again later.',
  };
}

// Global limiter (optional): caps *all* requests per IP
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 120 req/min/IP
  standardHeaders: true,
  legacyHeaders: false,
  message: json429,
});

// Confirm PIN limiter: stricter + per-IP+PIN-prefix bucket
export const confirmLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // 10 attempts per bucket per window
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // successful confirms don't count
  keyGenerator: (req: Request) => {
    // Bucket by IP + first 4 digits of the submitted PIN (reduces collateral blocking behind NAT)
    const ip = req.ip || 'ip';
    const prefix =
      typeof req.body?.pin === 'string' ? req.body.pin.slice(0, 4) : 'nopin';
    return `${ip}:${prefix}`;
  },
  message: json429,
});
