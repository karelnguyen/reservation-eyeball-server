import { CONFIG } from '../../config';
import { hashPin } from '../../core/pin';
import { reservationQueue } from '../../core/queue';
import { prisma } from '../../prisma';
import {
  ConfirmOk,
  ConfirmErr,
  ReservationErrorCode,
  ReservationStatus,
} from './types';

export async function confirmByPin(
  pin: string
): Promise<ConfirmOk | ConfirmErr> {
  if (!pin)
    return {
      ok: false,
      code: ReservationErrorCode.PIN_REQUIRED,
      message: 'PIN required',
    };

  try {
    const reservation = await findReservationByPin(pin);
    if (!reservation)
      return {
        ok: false,
        code: ReservationErrorCode.INVALID_PIN,
        message: 'Invalid PIN',
      };

    const now = new Date();
    const scheduledAt = new Date(reservation.scheduledAt);
    const validFrom = minusMinutes(scheduledAt, 15);

    const day = dayBounds(scheduledAt);
    const reservations = await prisma.reservation.findMany({
      where: { scheduledAt: { gte: day.start, lte: day.end } },
      orderBy: { scheduledAt: 'asc' },
      select: { id: true, scheduledAt: true, actualEnd: true },
    });

    const expectedStart = reservationQueue(
      reservations,
      CONFIG.SERVICE_TIME
    ).get(reservation.id)!;

    const { validUntil } = windowFor(scheduledAt, expectedStart);

    if (now < validFrom)
      return {
        ok: false,
        code: ReservationErrorCode.NOT_ACTIVE_YET,
        activatesAt: validFrom,
        message: 'PIN not active yet',
      };
    if (now > validUntil)
      return {
        ok: false,
        code: ReservationErrorCode.EXPIRED,
        expiredAt: validUntil,
        message: 'PIN expired',
      };

    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { status: ReservationStatus.CONFIRMED, confirmedAt: now },
    });

    return { ok: true, expectedStart, validFrom, validUntil };
  } catch (e: any) {
    return {
      ok: false,
      code: ReservationErrorCode.DB_ERROR,
      message: e.message,
    };
  }
}

// Helpers

function dayBounds(d: Date) {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}
function minutes(n: number) {
  return n * 60_000;
}
function plusMinutes(d: Date, m: number) {
  return new Date(+d + minutes(m));
}
function minusMinutes(d: Date, m: number) {
  return new Date(+d - minutes(m));
}

function windowFor(scheduledAt: Date, expectedStart: Date) {
  const nominalUntil = plusMinutes(scheduledAt, CONFIG.PIN_VALID_TIME);
  const queueUntil = plusMinutes(expectedStart, CONFIG.EXTRA_TIME);
  const hardCap = plusMinutes(scheduledAt, CONFIG.MAX_EXTENSION_TIME);
  const validUntil = new Date(
    Math.min(Math.max(+nominalUntil, +queueUntil), +hardCap)
  );
  return { nominalUntil, queueUntil, hardCap, validUntil };
}

async function findReservationByPin(pin: string) {
  const last4 = pin.slice(-4);
  const candidates = await prisma.reservation.findMany({
    where: { pinLast4: last4 },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, pinHash: true, pinSalt: true, scheduledAt: true },
  });
  return candidates.find((r) => hashPin(pin, r.pinSalt) === r.pinHash) ?? null;
}
