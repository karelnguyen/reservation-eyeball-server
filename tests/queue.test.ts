import { describe, it, expect } from 'vitest';
import { reservationQueue } from '../src/core/queue'; // <- fix path

const date = (s: string) => new Date(s);

function toISO(map: Map<bigint, Date>) {
  // convenience: transform Map<bigint, Date> → Record<string, string> for easy compares
  const out: Record<string, string> = {};
  for (const [k, v] of map) out[String(k)] = v.toISOString();
  return out;
}

describe('reservationQueue', () => {
  it('returns empty map for empty input', () => {
    const queue = reservationQueue([]);
    expect(queue.size).toBe(0);
  });

  it('handles a single reservation (starts at scheduled time)', () => {
    const queue = reservationQueue([
      { id: 1n, scheduledAt: date('2030-01-01T10:00:00Z') },
    ]);
    expect(queue.get(1n)!.toISOString()).toBe('2030-01-01T10:00:00.000Z');
  });

  it('no delay when gaps are >= service time (default 5m)', () => {
    const queue = reservationQueue([
      { id: 1n, scheduledAt: date('2030-01-01T10:00:00Z') },
      { id: 2n, scheduledAt: date('2030-01-01T10:05:00Z') },
      { id: 3n, scheduledAt: date('2030-01-01T10:10:00Z') },
    ]);
    expect(toISO(queue)).toEqual({
      '1': '2030-01-01T10:00:00.000Z',
      '2': '2030-01-01T10:05:00.000Z',
      '3': '2030-01-01T10:10:00.000Z',
    });
  });

  it('tight spacing pushes later reservations (cascade delay)', () => {
    const queue = reservationQueue([
      { id: 1n, scheduledAt: date('2030-01-01T10:00:00Z') },
      { id: 2n, scheduledAt: date('2030-01-01T10:01:00Z') },
      { id: 3n, scheduledAt: date('2030-01-01T10:02:00Z') },
    ]); // service = 5m
    expect(queue.get(1n)!.toISOString()).toBe('2030-01-01T10:00:00.000Z'); // on time
    expect(queue.get(2n)!.toISOString()).toBe('2030-01-01T10:05:00.000Z'); // waits for 1
    expect(queue.get(3n)!.toISOString()).toBe('2030-01-01T10:10:00.000Z'); // waits for 2
  });

  it('respects actualEnd when provided (overrides average duration)', () => {
    const queue = reservationQueue([
      {
        id: 1n,
        scheduledAt: date('2030-01-01T10:00:00Z'),
        actualEnd: date('2030-01-01T10:07:00Z'), // longer than 5m
      },
      { id: 2n, scheduledAt: date('2030-01-01T10:05:00Z') },
      { id: 3n, scheduledAt: date('2030-01-01T10:08:00Z') },
    ]);
    // #2 must wait until 10:07 (prev actual end)
    expect(queue.get(2n)!.toISOString()).toBe('2030-01-01T10:07:00.000Z');
    // #3 can start at 10:08 (no wait, since prev ends 10:12 if using average, but here prev was 10:12? No—prevEnd was computed for #2 as 10:12 using avg; however #3 scheduled at 10:08 -> waits until 10:12)
    // Careful: #2 has no actualEnd, so we assume +5m from 10:07 -> 10:12
    expect(queue.get(3n)!.toISOString()).toBe('2030-01-01T10:12:00.000Z');
  });

  it('input order does not matter (we sort by scheduledAt)', () => {
    const shuffled = [
      { id: 3n, scheduledAt: date('2030-01-01T10:10:00Z') },
      { id: 1n, scheduledAt: date('2030-01-01T10:00:00Z') },
      { id: 2n, scheduledAt: date('2030-01-01T10:05:00Z') },
    ];
    const queue = reservationQueue(shuffled);
    expect(toISO(queue)).toEqual({
      '1': '2030-01-01T10:00:00.000Z',
      '2': '2030-01-01T10:05:00.000Z',
      '3': '2030-01-01T10:10:00.000Z',
    });
  });

  it('identical scheduled times queue in input order after sort-tie (stable sort assumption)', () => {
    const queue = reservationQueue([
      { id: 1n, scheduledAt: date('2030-01-01T10:00:00Z') },
      { id: 2n, scheduledAt: date('2030-01-01T10:00:00Z') },
      { id: 3n, scheduledAt: date('2030-01-01T10:00:00Z') },
    ]);
    // first starts at 10:00, others get pushed by 5m each
    expect(queue.get(1n)!.toISOString()).toBe('2030-01-01T10:00:00.000Z');
    expect(queue.get(2n)!.toISOString()).toBe('2030-01-01T10:05:00.000Z');
    expect(queue.get(3n)!.toISOString()).toBe('2030-01-01T10:10:00.000Z');
  });

  it('custom averageServiceMinutes changes the spacing', () => {
    const queue = reservationQueue(
      [
        { id: 1n, scheduledAt: date('2030-01-01T10:00:00Z') },
        { id: 2n, scheduledAt: date('2030-01-01T10:01:00Z') },
        { id: 3n, scheduledAt: date('2030-01-01T10:02:00Z') },
      ],
      3 // 3 minutes per service instead of 5
    );
    // With 3m service, delays are smaller:
    expect(queue.get(2n)!.toISOString()).toBe('2030-01-01T10:03:00.000Z'); // waits for 1 until 10:03
    expect(queue.get(3n)!.toISOString()).toBe('2030-01-01T10:06:00.000Z'); // waits for 2 until 10:06
  });
});
