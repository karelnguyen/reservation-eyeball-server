import type { Request, Response, NextFunction } from 'express';
import type { AnyZodObject } from 'zod';
import { ReservationErrorCode } from '../services/reservations/types';

export function validateBody(schema: AnyZodObject) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const message = result.error.issues
        .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
        .join('; ');
      return res.status(400).json({
        ok: false,
        code: ReservationErrorCode.VALIDATION,
        message,
        error: message,
      });
    }
    // Replace body with parsed (trimmed/coerced) data
    (req as any).body = result.data;
    next();
  };
}
