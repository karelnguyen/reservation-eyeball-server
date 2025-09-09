import { type Reservation } from '@prisma/client';
import { CONFIG } from '../config';

type QueueReservation = Pick<Reservation, 'id' | 'scheduledAt'> & {
  actualEnd?: Date | null;
};

export function reservationQueue(
  reservations: QueueReservation[],
  averageServiceMinutes = CONFIG.SERVICE_TIME
) {
  const queue = new Map<bigint, Date>();
  const serviceDurationMs = averageServiceMinutes * 60_000;

  // Sort reservations chronologically by scheduled time
  const sortedReservations = [...reservations].sort(
    (a, b) => +a.scheduledAt - +b.scheduledAt
  );

  let previousEndTime: Date | null = null;

  for (const reservation of sortedReservations) {
    // If the previous appointment ends after my scheduled time,
    // I have to wait until it finishes. Otherwise, I can start on time.
    const baselineStart: Date =
      previousEndTime && previousEndTime > reservation.scheduledAt
        ? previousEndTime
        : reservation.scheduledAt;

    const expectedStart = new Date(baselineStart);
    queue.set(reservation.id, expectedStart);

    // Estimate when this reservation will end:
    // - Use actualEnd if known (from telemetry)
    // - Otherwise assume average service time
    previousEndTime =
      reservation.actualEnd ?? new Date(+expectedStart + serviceDurationMs);
  }

  return queue; // Map<reservationId, expectedStartTime>
}
