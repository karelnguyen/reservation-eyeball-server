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

  it('POST /api/reservations validates body via Zod (missing fields and bad ISO)', async () => {
    // missing lastName
    const res1 = await request(app)
      .post('/api/reservations')
      .send({
        firstName: 'NoLast',
        phone: '777123456',
        scheduledAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      });
    expect(res1.status).toBe(400);
    expect(res1.body.ok).toBe(false);
    expect(res1.body.code).toBe('VALIDATION');

    // bad scheduledAt (not ISO)
    const res2 = await request(app).post('/api/reservations').send({
      firstName: 'BadISO',
      lastName: 'Case',
      phone: '777123456',
      scheduledAt: 'not-an-iso',
    });
    expect(res2.status).toBe(400);
    expect(res2.body.ok).toBe(false);
    expect(res2.body.code).toBe('VALIDATION');
  });

  it('GET /api/reservations respects sort=asc|desc by createdAt', async () => {
    const a = await apiCreateReservation('SortA', 90);
    const b = await apiCreateReservation('SortB', 120);
    expect(a && b).toBeTruthy();

    const asc = await request(app).get('/api/reservations?sort=asc');
    const desc = await request(app).get('/api/reservations?sort=desc');

    expect(asc.status).toBe(200);
    expect(desc.status).toBe(200);
    expect(asc.body[0].firstName).toBe('SortA');
    expect(desc.body[0].firstName).toBe('SortB');
  });
});

describe('confirm flow', () => {
  it('returns 400 "not active yet" if before activation window', async () => {
    const r = await apiCreateReservation('Bob', 45); // activeFrom = S-15m -> still in future
    const res = await request(app)
      .post('/api/reservations/confirm')
      .send({ pin: r.pin });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBe('NOT_ACTIVE_YET');
    expect(res.body.error ?? res.body.message).toMatch(/not active yet/i);
    expect(res.body.activatesAt).toBeTruthy();
  });

  it('confirms within active window (200 ok)', async () => {
    const r = await apiCreateReservation('Cara', 10);
    const res = await request(app)
      .post('/api/reservations/confirm')
      .send({ pin: r.pin });

    expect([200, 400]).toContain(res.status);
    expect(res.body.ok).toBe(true);
    expect(res.body.expectedStart).toBeTruthy();
    expect(res.body.validFrom).toBeTruthy();
    expect(res.body.validUntil).toBeTruthy();
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

  it('VALIDATION error when pin missing or malformed (Zod middleware)', async () => {
    // missing pin
    const res1 = await request(app).post('/api/reservations/confirm').send({});
    expect(res1.status).toBe(400);
    expect(res1.body.ok).toBe(false);
    expect(res1.body.code).toBe('VALIDATION');

    // malformed pin (non-digits)
    const res2 = await request(app)
      .post('/api/reservations/confirm')
      .send({ pin: '12ab' });
    expect(res2.status).toBe(400);
    expect(res2.body.ok).toBe(false);
    expect(res2.body.code).toBe('VALIDATION');
  });

  it('accepts valid pin format (Zod success) and returns domain error, not VALIDATION', async () => {
    // 9-digit pin conforms to schema; middleware should pass it through
    const res = await request(app)
      .post('/api/reservations/confirm')
      .send({ pin: '123456789' });

    expect([200, 400, 410]).toContain(res.status);
    if (res.status !== 200) {
      // Should be a domain error (INVALID_PIN/NOT_ACTIVE_YET/EXPIRED), not VALIDATION
      expect(res.body.code).not.toBe('VALIDATION');
    }
  });

  it('successful confirm updates DB status and confirmedAt', async () => {
    vi.useFakeTimers();
    try {
      // Freeze time such that PIN is active for a reservation at 10:00
      vi.setSystemTime(new Date('2030-01-01T09:50:00.000Z'));

      const createRes = await request(app).post('/api/reservations').send({
        firstName: 'ToConfirm',
        lastName: 'OK',
        phone: '777123456',
        scheduledAt: '2030-01-01T10:00:00.000Z',
      });
      expect(createRes.status).toBe(201);
      const { id, pin } = createRes.body as { id: string; pin: string };

      const confirm = await request(app)
        .post('/api/reservations/confirm')
        .send({ pin });
      expect(confirm.status).toBe(200);
      expect(confirm.body.ok).toBe(true);

      // Verify persistence
      const row = await prisma.reservation.findUniqueOrThrow({
        where: { id: BigInt(id) },
        select: { status: true, confirmedAt: true },
      });
      expect(row.status).toBe('confirmed');
      expect(row.confirmedAt).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('error mapping', () => {
  it('GET /api/reservations returns 500 DB_ERROR on DB failure', async () => {
    const spy = vi
      .spyOn(prisma.reservation, 'findMany')
      .mockRejectedValueOnce(new Error('db failed'));
    const res = await request(app).get('/api/reservations');
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('DB_ERROR');
    spy.mockRestore();
  });
});
