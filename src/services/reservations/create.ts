import { MIN, CONFIG } from '../../config';
import { generateHashedPin } from '../../core/pin';
import { prisma } from '../../prisma';
import {
  CreateOk,
  CreateErr,
  ReservationErrorCode,
  ReservationStatus,
} from './types';

export async function createReservation(input: {
  firstName: string;
  lastName: string;
  phone: string;
  scheduledAt: string; // ISO
}): Promise<CreateOk | CreateErr> {
  const scheduledAt = new Date(input.scheduledAt);
  if (isNaN(+scheduledAt)) {
    return {
      ok: false,
      code: ReservationErrorCode.VALIDATION,
      message: 'scheduledAt must be ISO date',
    };
  }
  if (scheduledAt <= new Date()) {
    return {
      ok: false,
      code: ReservationErrorCode.VALIDATION,
      message: 'scheduledAt must be in the future',
    };
  }

  try {
    const { created, pin } = await prisma.$transaction(async (tx) => {
      const created = await tx.reservation.create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          scheduledAt,
          status: ReservationStatus.BOOKED,
          pinHash: '-',
          pinSalt: '-',
          pinLast4: '-',
          actualEnd: null,
        },
        select: { id: true, scheduledAt: true },
      });

      const { pin, pinHash, salt } = generateHashedPin(
        created.id,
        created.scheduledAt
      );

      await tx.reservation.update({
        where: { id: created.id },
        data: { pinHash, pinSalt: salt, pinLast4: pin.slice(-4) },
      });

      return { created, pin };
    });

    const activeFrom = new Date(+created.scheduledAt - MIN(15));
    const nominalExpiry = new Date(
      +created.scheduledAt + MIN(CONFIG.PIN_VALID_TIME)
    );

    return {
      ok: true,
      id: String(created.id),
      pin,
      activeFrom,
      nominalExpiry,
    };
  } catch (e: any) {
    return {
      ok: false,
      code: ReservationErrorCode.DB_ERROR,
      message: e.message,
    };
  }
}
