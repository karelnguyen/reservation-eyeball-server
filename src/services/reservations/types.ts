export enum ReservationErrorCode {
  VALIDATION = 'VALIDATION',
  DB_ERROR = 'DB_ERROR',
  PIN_REQUIRED = 'PIN_REQUIRED',
  INVALID_PIN = 'INVALID_PIN',
  NOT_ACTIVE_YET = 'NOT_ACTIVE_YET',
  EXPIRED = 'EXPIRED',
}

export enum ReservationStatus {
  BOOKED = 'booked',
  CONFIRMED = 'confirmed',
}

export type PublicReservationRow = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string; // masked e.g. "•••3456"
  scheduledAt: Date;
  status: string;
  confirmedAt: Date | null;
  pinLast4: string;
  createdAt: Date;
};

export type ListOk = { ok: true; reservations: PublicReservationRow[] };
export type ListErr = {
  ok: false;
  code: ReservationErrorCode.DB_ERROR;
  message: string;
};

export type CreateOk = {
  ok: true;
  id: string;
  pin: string;
  activeFrom: Date;
  nominalExpiry: Date;
};
export type CreateErr =
  | { ok: false; code: ReservationErrorCode.VALIDATION; message: string }
  | { ok: false; code: ReservationErrorCode.DB_ERROR; message: string };

export type ConfirmOk = {
  ok: true;
  expectedStart: Date;
  validFrom: Date;
  validUntil: Date;
};
export type ConfirmErr =
  | { ok: false; code: ReservationErrorCode.PIN_REQUIRED; message: string }
  | { ok: false; code: ReservationErrorCode.INVALID_PIN; message: string }
  | {
      ok: false;
      code: ReservationErrorCode.NOT_ACTIVE_YET;
      activatesAt: Date;
      message: string;
    }
  | {
      ok: false;
      code: ReservationErrorCode.EXPIRED;
      expiredAt: Date;
      message: string;
    }
  | { ok: false; code: ReservationErrorCode.DB_ERROR; message: string };
