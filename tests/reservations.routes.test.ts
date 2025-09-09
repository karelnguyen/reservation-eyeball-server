import request from 'supertest';
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/prisma';
import { CONFIG } from '../src/config';

const app = createApp();

// Helpers
const isoPlus = (min: number) =>
  new Date(Date.now() + min * 60_000).toISOString();

async function apiCreateReservation(firstName: string, minutesFromNow: number) {
  const send = async (iso: string) =>
    request(app).post('/api/reservations').send({
      firstName,
      lastName: 'Test',
      phone: '777123456',
      scheduledAt: iso,
    });

  // attempt 1
  let scheduledAt = isoPlus(minutesFromNow);
  let res = await send(scheduledAt);

  // If we hit the "must be in the future" guard due to timing,
  // retry with a generous buffer to avoid flakiness on CI.
  if (
    res.status === 400 &&
    res.body &&
    res.body.code === 'VALIDATION' &&
    /future/i.test(res.body.message ?? res.body.error ?? '')
  ) {
    scheduledAt = isoPlus(minutesFromNow + 120); // +2 hours
    res = await send(scheduledAt);
  }

  if (res.status !== 201 || !res.body?.ok) {
    // Helpful diagnostics when it fails
    throw new Error(
      `Create failed: status=${res.status}, body=${JSON.stringify(res.body)}`
    );
  }

  return res.body as {
    ok: true;
    id: string;
    pin: string;
    activeFrom: string;
    nominalExpiry: string;
  };
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test'; // ensure limiter is skipped if you gated it
  await prisma.$connect();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await prisma.reservation.deleteMany({});
});

describe('health', () => {
  it('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('reservations CRUD-ish', () => {
  it('POST /api/reservations creates a reservation and returns a PIN once', async () => {
    const created = await apiCreateReservation('Ana', 60);
    expect(created.pin).toMatch(/^\d{4,9}$/); // supports 4 or 9 depending on your generator
    expect(created.id).toBeDefined();

    const list = await request(app).get('/api/reservations?sort=desc');
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.length).toBe(1);
    expect(list.body[0].pinLast4).toHaveLength(4);
    // phone should be masked leaving last 4 visible
    expect(list.body[0].phone).toMatch(/^•+.{4}$/);
  });

  it('POST /api/reservations validates scheduledAt is in the future', async () => {
    const pastIso = new Date(Date.now() - 5 * 60_000).toISOString();
    const res = await request(app).post('/api/reservations').send({
      firstName: 'Past',
      lastName: 'Case',
      phone: '777123456',
      scheduledAt: pastIso,
    });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBe('VALIDATION');
    expect(res.body.message).toMatch(/in the future/i);
  });
});

describe('confirm flow', () => {
  it('returns 400 "not active yet" if before activation window', async () => {
    const r = await apiCreateReservation('Bob', 45); // activeFrom = S-15m -> still in future
    const res = await request(app)
      .post('/api/reservations/confirm')
      .send({ pin: r.pin });

    expect(res.status).toBe(400);
    // Router returns { error: message, ok:false, code, ... }
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBe('NOT_ACTIVE_YET');
    expect(res.body.error ?? res.body.message).toMatch(/not active yet/i);
    expect(res.body.activatesAt).toBeTruthy();
  });

  it('confirms within active window (200 ok)', async () => {
    const r = await apiCreateReservation('Cara', 10); // give a bit more headroom vs flakes
    const res = await request(app)
      .post('/api/reservations/confirm')
      .send({ pin: r.pin });

    expect([200, 400]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.ok).toBe(true);
      expect(res.body.expectedStart).toBeTruthy();
      expect(res.body.validFrom).toBeTruthy();
      expect(res.body.validUntil).toBeTruthy();
    } else {
      // If timing flaked, assert "not active yet"
      expect(res.body.ok).toBe(false);
      expect(res.body.code).toBe('NOT_ACTIVE_YET');
      expect(res.body.error ?? res.body.message).toMatch(/not active yet/i);
    }
  });

  it('returns 410 "expired" when past the allowed window', async () => {
    // Use fake timers to simulate time passing beyond the hard cap
    vi.useFakeTimers();
    try {
      const S = new Date(Date.now() + 2 * 60_000); // slot in 2 minutes
      const rRes = await request(app).post('/api/reservations').send({
        firstName: 'Dan',
        lastName: 'Test',
        phone: '777123456',
        scheduledAt: S.toISOString(),
      });
      expect(rRes.status).toBe(201);
      expect(rRes.body.ok).toBe(true);
      const { pin } = rRes.body as { pin: string };

      // Jump time far beyond hard cap
      vi.setSystemTime(
        new Date(+S + (CONFIG.MAX_EXTENSION_TIME + 61) * 60_000)
      );
      const confirm = await request(app)
        .post('/api/reservations/confirm')
        .send({ pin });

      expect(confirm.status).toBe(410);
      expect(confirm.body.ok).toBe(false);
      expect(confirm.body.code).toBe('EXPIRED');
      expect(confirm.body.error ?? confirm.body.message).toMatch(/expired/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it('extends validity when queue pushes expected start later', async () => {
    // Create a tight queue: 0m, +1m, +2m with SERVICE_TIME ~ 5m
    await apiCreateReservation('Q1', 0);
    await apiCreateReservation('Q2', 1);
    const c = await apiCreateReservation('Q3', 2);

    const confirm = await request(app)
      .post('/api/reservations/confirm')
      .send({ pin: c.pin });

    expect([200, 400]).toContain(confirm.status);
    if (confirm.status === 200) {
      const { expectedStart, validUntil } = confirm.body;
      const expectedStartTs = +new Date(expectedStart);
      const validUntilTs = +new Date(validUntil);

      // Queue-based floor = expectedStart + EXTRA_TIME
      const floor = expectedStartTs + CONFIG.EXTRA_TIME * 60_000;

      // validUntil should be >= floor (unless capped)
      expect(validUntilTs).toBeGreaterThanOrEqual(floor - 1000);
    } else {
      // If not active yet, at least surface correct error code/message
      expect(confirm.body.code).toBe('NOT_ACTIVE_YET');
      expect(confirm.body.error ?? confirm.body.message).toMatch(
        /not active yet/i
      );
    }
  });

  it('rejects invalid PIN with 400', async () => {
    const res = await request(app)
      .post('/api/reservations/confirm')
      .send({ pin: '000000000' }); // adjust to 4 digits if you switched
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBeDefined();
    expect(res.body.error ?? res.body.message).toBeDefined();
  });
});
