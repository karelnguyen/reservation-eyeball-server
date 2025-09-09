import crypto from 'crypto';

/**
 * Compute the Luhn check digit for a numeric string.
 *
 * Why use Luhn?
 * - The Luhn algorithm is a lightweight checksum (used in credit cards).
 * - It makes PINs self-validating: a random guess has only a 1 in 10 chance
 *   of having the correct checksum digit at the end.
 * - That means if someone tries to brute-force PINs, ~90% of inputs are rejected
 *   immediately (checksum fails) before we even look in the database.
 *
 * In practice:
 * - We generate an 8-digit number from HMAC(secret, id+time).
 * - We then append 1 digit from Luhn to make a 9-digit PIN.
 * - This is why all PINs have a consistent length and a built-in validity check.
 */
export function luhnDigit(numeric: string) {
  let sum = 0;
  let shouldDouble = false; // alternate doubling every other digit

  // Walk digits right → left
  for (let i = numeric.length - 1; i >= 0; i--) {
    let digit = numeric.charCodeAt(i) - 48; // '0' → 48 in ASCII

    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9; // same as summing digits
    }

    sum += digit;
    shouldDouble = !shouldDouble; // flip toggle
  }

  // The check digit makes the total divisible by 10
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit.toString();
}

export function getPin(id: bigint, scheduledAt: Date, secret: string) {
  const payload = `${id}|${scheduledAt.toISOString()}`;
  const digest = crypto.createHmac('sha256', secret).update(payload).digest();
  const slice = digest.subarray(0, 5).toString('hex');
  const base = (BigInt('0x' + slice) % 100000000n).toString().padStart(8, '0');
  return base + luhnDigit(base); // 9 digits total
}

export function hashPin(pin: string, salt: string) {
  return crypto
    .createHash('sha256')
    .update(pin + salt)
    .digest('hex');
}

// Generate a human PIN using a secret, then hash it with salt
export function generateHashedPin(id: bigint, scheduledAt: Date) {
  const pin = getPin(id, scheduledAt, process.env.PIN_SECRET!);
  const salt = Math.random().toString(36).slice(2, 10);
  const pinHash = hashPin(pin, salt);

  return { pin, salt, pinHash };
}
