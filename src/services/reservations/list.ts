import { prisma } from '../../prisma';
import { ListOk, ListErr, ReservationErrorCode } from './types';

export async function listReservations(
  sort: 'asc' | 'desc' = 'desc'
): Promise<ListOk | ListErr> {
  try {
    const rows = await prisma.reservation.findMany({
      orderBy: { createdAt: sort },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        scheduledAt: true,
        status: true,
        confirmedAt: true,
        pinLast4: true,
        createdAt: true,
      },
    });

    const reservations = rows.map((r) => ({
      ...r,
      id: String(r.id),
      phone: r.phone.replace(/.(?=.{4})/g, '•'),
    }));

    return { ok: true, reservations };
  } catch (e: any) {
    return {
      ok: false,
      code: ReservationErrorCode.DB_ERROR,
      message: e.message,
    };
  }
}
