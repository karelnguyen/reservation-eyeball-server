import {
  describe,
  it,
  beforeAll,
  afterAll,
  beforeEach,
  expect,
  vi,
} from 'vitest';
import { prisma } from '../src/prisma';
import { CONFIG } from '../src/config';

import {
  ReservationErrorCode,
  ReservationStatus,
} from '../src/services/reservations/types';
import {
  createReservation,
  listReservations,
  confirmByPin,
} from '../src/services/reservations';

const isoPlus = (min: number) =>
  new Date(Date.now() + min * 60_000).toISOString();

beforeAll(async () => {
  process.env.PIN_SECRET ||= 'test-secret';
  process.env.TZ ||= 'UTC';
  process.env.NODE_ENV = 'test';
  await prisma.$connect();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await prisma.reservation.deleteMany({});
});

describe('createReservation (service)', () => {
  it('creates reservation and stores salted hash + last4', async () => {
    const out = await createReservation({
      firstName: 'Alice',
      lastName: 'Svc',
      phone: '777123456',
      scheduledAt: isoPlus(180),
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    const row = await prisma.reservation.findUniqueOrThrow({
      where: { id: BigInt(out.id) },
    });
    expect(row.pinHash).toBeTruthy();
    expect(row.pinSalt).toBeTruthy();
    expect(row.pinLast4).toHaveLength(4);
    expect(row.status).toBe(ReservationStatus.BOOKED);
  });

  it('rejects past time with VALIDATION', async () => {
    const out = await createReservation({
      firstName: 'Past',
      lastName: 'Case',
      phone: '777123456',
      scheduledAt: isoPlus(-5),
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe(ReservationErrorCode.VALIDATION);
    expect(out.message).toMatch(/future/i);
  });
});

describe('listReservations (service)', () => {
  it('returns masked phone + stringified id', async () => {
    const a = await createReservation({
      firstName: 'Ana',
      lastName: 'L',
      phone: '777123456',
      scheduledAt: isoPlus(200),
    });
    const b = await createReservation({
      firstName: 'Ben',
      lastName: 'L',
      phone: '606123456',
      scheduledAt: isoPlus(210),
    });
    expect(a.ok && b.ok).toBe(true);

    const list = await listReservations('desc');
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.reservations).toHaveLength(2);
    const r0 = list.reservations[0];
    expect(typeof r0.id).toBe('string');
    expect(r0.phone).toMatch(/^•+.{4}$/);
  });
});

describe('confirmByPin (service)', () => {
  it('NOT_ACTIVE_YET before activation', async () => {
    const r = await createReservation({
      firstName: 'Bob',
      lastName: 'C',
      phone: '777123456',
      scheduledAt: isoPlus(45),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const out = await confirmByPin(r.pin);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe(ReservationErrorCode.NOT_ACTIVE_YET);
  });

  it('EXPIRED after hard cap', async () => {
    vi.useFakeTimers();
    try {
      const S = new Date(Date.now() + 2 * 60_000);
      const r = await createReservation({
        firstName: 'Dan',
        lastName: 'C',
        phone: '777123456',
        scheduledAt: S.toISOString(),
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;

      vi.setSystemTime(
        new Date(+S + (CONFIG.MAX_EXTENSION_TIME + 61) * 60_000)
      );
      const out = await confirmByPin(r.pin);
      expect(out.ok).toBe(false);
      if (out.ok) return;
      expect(out.code).toBe(ReservationErrorCode.EXPIRED);
    } finally {
      vi.useRealTimers();
    }
  });

  it('test prolonging expiry of the pins', async () => {
    vi.useFakeTimers();
    try {
      // Fix "now" so activation windows are already open for the 10:02 reservation.
      vi.setSystemTime(new Date('2030-01-01T09:50:00Z'));

      // Create a tight queue: 10:00, 10:01, 10:02 with average service 5m.
      const q1 = await createReservation({
        firstName: 'Q1',
        lastName: 'C',
        phone: '777123456',
        scheduledAt: '2030-01-01T10:00:00.000Z',
      });
      const q2 = await createReservation({
        firstName: 'Q2',
        lastName: 'C',
        phone: '777123456',
        scheduledAt: '2030-01-01T10:01:00.000Z',
      });
      const q3 = await createReservation({
        firstName: 'Q3',
        lastName: 'C',
        phone: '777123456',
        scheduledAt: '2030-01-01T10:02:00.000Z',
      });
      expect(q1.ok && q2.ok && q3.ok).toBe(true);
      if (!q3.ok) return;

      const out = await confirmByPin(q3.pin);
      // With now=09:50, q3.validFrom=09:47 so it should be active.
      expect(out.ok).toBe(true);

      if (out.ok) {
        const expectedStartTs = +new Date(out.expectedStart);
        const validUntilTs = +new Date(out.validUntil);
        const floor = expectedStartTs + CONFIG.EXTRA_TIME * 60_000;

        // validUntil should be at least expectedStart + EXTRA_TIME (unless hard capped)
        expect(validUntilTs).toBeGreaterThanOrEqual(floor - 1);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('INVALID_PIN test', async () => {
    const out = await confirmByPin('000000000');
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect([
      ReservationErrorCode.INVALID_PIN,
      ReservationErrorCode.PIN_REQUIRED,
    ]).toContain(out.code);
  });
});
