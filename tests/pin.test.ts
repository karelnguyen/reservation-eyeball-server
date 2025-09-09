import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { luhnDigit, getPin, hashPin, generatePin } from '../src/core/pin'; // <- fix path if needed

describe('luhnDigit', () => {
  it('returns a single digit string 0-9', () => {
    const check = luhnDigit('12345678');
    expect(check).toMatch(/^\d$/);
  });

  it('makes total divisible by 10 (classic Luhn property)', () => {
    const base = '799273987'; // known Luhn example (shortened base)
    const check = luhnDigit(base);
    const full = base + check;

    // Recompute the checksum over the full number should end in 0
    // Implement a tiny sum check inline:
    const sum = [...full]
      .reverse()
      .map((c) => c.charCodeAt(0) - 48)
      .reduce((acc, value, i) => {
        if (i % 2 === 1) {
          value *= 2;
          if (value > 9) value -= 9;
        }
        return acc + value;
      }, 0);

    expect(sum % 10).toBe(0);
  });
});

describe('getPin', () => {
  const secret = 'unit-test-secret';
  const when = new Date('2030-01-01T10:00:00.000Z');

  it('is deterministic for same inputs', () => {
    const p1 = getPin(1n, when, secret);
    const p2 = getPin(1n, when, secret);
    expect(p1).toBe(p2);
  });

  it('changes when id changes', () => {
    const p1 = getPin(1n, when, secret);
    const p2 = getPin(2n, when, secret);
    expect(p1).not.toBe(p2);
  });

  it('changes when date changes', () => {
    const p1 = getPin(1n, when, secret);
    const p2 = getPin(1n, new Date('2030-01-01T10:05:00.000Z'), secret);
    expect(p1).not.toBe(p2);
  });

  it('has 9 digits and last digit equals Luhn of first 8', () => {
    const pin = getPin(42n, when, secret);
    expect(pin).toMatch(/^\d{9}$/);
    const base8 = pin.slice(0, 8);
    const check = pin.slice(8);
    expect(check).toBe(luhnDigit(base8));
  });
});

describe('hashPin', () => {
  it('is reproducible for same pin+salt and different for different salt', () => {
    const pin = '123456789';
    const salt1 = 'saltA';
    const salt2 = 'saltB';

    const h1 = hashPin(pin, salt1);
    const h1b = hashPin(pin, salt1);
    const h2 = hashPin(pin, salt2);

    expect(h1).toBe(h1b);
    expect(h1).not.toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/); // sha256 hex
  });
});

describe('generatePin', () => {
  const realRandom = Math.random;
  const OLD_SECRET = process.env.PIN_SECRET;

  beforeAll(() => {
    // Fix randomness and set a test secret so the test is stable
    vi.stubGlobal('Math', { ...Math, random: () => 0.123456 }); // deterministic salt
    process.env.PIN_SECRET = 'test-secret-for-generatePin';
  });

  afterAll(() => {
    // Restore
    // @ts-ignore restoring Math.random
    global.Math.random = realRandom;
    if (OLD_SECRET === undefined) delete process.env.PIN_SECRET;
    else process.env.PIN_SECRET = OLD_SECRET;
  });

  it('returns a 9-digit pin, an 8-char salt, and a sha256 hash', () => {
    const when = new Date('2030-01-01T10:00:00.000Z');
    const { pin, salt, pinHash } = generatePin(99n, when);

    expect(pin).toMatch(/^\d{9}$/);
    expect(salt).toHaveLength(8); // from .slice(2, 10)
    expect(pinHash).toMatch(/^[a-f0-9]{64}$/); // sha256 hex

    // Hash should verify
    expect(pinHash).toBe(hashPin(pin, salt));
  });

  it('salt changes (with different randomness) → different hash, same PIN for same id/date/secret', () => {
    const when = new Date('2030-01-01T10:00:00.000Z');

    // First run with stubbed randomness
    const { pin: pin1, salt: salt1, pinHash: hash1 } = generatePin(100n, when);

    // Temporarily change randomness
    // @ts-ignore
    global.Math.random = () => 0.987654;
    const { pin: pin2, salt: salt2, pinHash: hash2 } = generatePin(100n, when);

    expect(pin1).toBe(pin2); // same PIN (deterministic by id+time+secret)
    expect(salt1).not.toBe(salt2); // different salts
    expect(hash1).not.toBe(hash2); // thus different hashes

    // restore stubbed one
    // @ts-ignore
    global.Math.random = () => 0.123456;
  });
});
