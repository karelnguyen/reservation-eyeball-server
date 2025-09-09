import { ReservationErrorCode } from '../services/reservations';

export class HttpError extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
  }
}

const ERROR_STATUS: Record<ReservationErrorCode, number> = {
  [ReservationErrorCode.VALIDATION]: 400,
  [ReservationErrorCode.PIN_REQUIRED]: 400,
  [ReservationErrorCode.INVALID_PIN]: 400,
  [ReservationErrorCode.NOT_ACTIVE_YET]: 400,
  [ReservationErrorCode.EXPIRED]: 410,
  [ReservationErrorCode.DB_ERROR]: 500,
};

export function getErrorStatus(code?: ReservationErrorCode): number {
  return (code && ERROR_STATUS[code]) || 400;
}
