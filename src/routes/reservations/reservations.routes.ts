import { Router } from 'express';
import { confirmLimiter } from '../../security/rateLimit';
import {
  listReservations,
  createReservation,
  confirmByPin,
  ReservationErrorCode,
} from '../../services/reservations';
import { validateBody } from '../../middleware/validate';
import {
  CreateReservationSchema,
  ConfirmPinSchema,
} from '../../validation/reservations';

const router = Router();

const ERROR_STATUS: Record<ReservationErrorCode, number> = {
  [ReservationErrorCode.VALIDATION]: 400,
  [ReservationErrorCode.PIN_REQUIRED]: 400,
  [ReservationErrorCode.INVALID_PIN]: 400,
  [ReservationErrorCode.NOT_ACTIVE_YET]: 400,
  [ReservationErrorCode.EXPIRED]: 410,
  [ReservationErrorCode.DB_ERROR]: 500,
};

export function getStatus(code?: ReservationErrorCode): number {
  return (code && ERROR_STATUS[code]) || 400;
}

router.get('/', async (req, res) => {
  const sort = (req.query.sort as string) === 'asc' ? 'asc' : 'desc';
  const result = await listReservations(sort);
  if (!result.ok) {
    return res
      .status(getStatus(result.code))
      .json({ ...result, error: result.message });
  }
  return res.json(result.reservations);
});

router.post('/', validateBody(CreateReservationSchema), async (req, res) => {
  const result = await createReservation(req.body ?? {});
  if (!result.ok) {
    return res
      .status(getStatus(result.code))
      .json({ ...result, error: result.message });
  }
  return res.status(201).json(result);
});

router.post(
  '/confirm',
  ...(process.env.NODE_ENV === 'test' ? ([] as any[]) : [confirmLimiter]),
  validateBody(ConfirmPinSchema),
  async (req, res) => {
    const result = await confirmByPin(req.body?.pin);
    if (!result.ok) {
      return res
        .status(getStatus(result.code))
        .json({ ...result, error: result.message });
    }
    return res.json(result);
  }
);

export default router;
