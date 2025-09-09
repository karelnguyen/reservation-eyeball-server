import crypto from 'crypto';

// Compute the Luhn check digit for a numeric string
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

  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit.toString();
}

export function createPin(id: bigint, scheduledAt: Date, secret: string) {
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

export function generatePin(id: bigint, scheduledAt: Date) {
  const pin = createPin(id, scheduledAt, process.env.PIN_SECRET!);
  const salt = Math.random().toString(36).slice(2, 10);
  const pinHash = hashPin(pin, salt);

  return { pin, salt, pinHash };
}
