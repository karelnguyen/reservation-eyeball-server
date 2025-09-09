<div align="center">

# Reservation Eyeball (Backend)

API for booking and confirming online reservations with queue‑aware PIN validity.

</div>

---

## Table of Contents

- Overview
- Tech Stack
- Setup
- API
- Data Model
- PIN & Queue Logic
- Configuration
- Project Structure
- Scripts

## Overview

- Creates reservations and returns a 9‑digit PIN (only salted hash + last 4 stored).
- PIN activates 15 minutes before the slot and remains valid for a limited time.
- Queue model extends validity when earlier appointments push your expected start.

## Tech Stack

- Node.js + Express 5
- Prisma (PostgreSQL)
- Zod (request validation)
- Vitest + Supertest (tests)

## Setup

1. Install dependencies

```bash
npm install
```

2. Configure environment

```env
DATABASE_URL="postgresql://user:password@host:5432/db?schema=public"
CORS_ORIGIN="http://localhost:5173"
PORT=4000
PIN_SECRET="replace-me"
```

3. Apply schema and run

```bash
npx prisma db push
npm run dev   # http://localhost:4000
```

Run tests

```bash
npm test
```

## API

Base URL: `http://localhost:4000`

### GET `/api/health`

Liveness probe.

Response

```json
{ "ok": true }
```

### GET `/api/reservations?sort=asc|desc`

Lists reservations ordered by creation time (default `desc`).

Example

```bash
curl "http://localhost:4000/api/reservations?sort=desc"
```

### POST `/api/reservations`

Create a reservation. `scheduledAt` must be an ISO date in the future.

Request

```json
{
  "firstName": "Ana",
  "lastName": "L",
  "phone": "777123456",
  "scheduledAt": "2030-01-01T10:00:00.000Z"
}
```

Response (201)

```json
{
  "ok": true,
  "id": "123",
  "pin": "123456789",
  "activeFrom": "2030-01-01T09:45:00.000Z",
  "nominalExpiry": "2030-01-01T10:15:00.000Z"
}
```

### POST `/api/reservations/confirm`

Confirm by PIN (4–9 digits). Returns the computed window considering the queue.

Request

```json
{ "pin": "123456789" }
```

Response (200)

```json
{
  "ok": true,
  "expectedStart": "2030-01-01T10:06:00.000Z",
  "validFrom": "2030-01-01T09:45:00.000Z",
  "validUntil": "2030-01-01T10:16:00.000Z"
}
```

Errors

- 400 VALIDATION / INVALID_PIN / NOT_ACTIVE_YET
- 410 EXPIRED
- 500 DB_ERROR

## Data Model

Reservation (selected fields)

- `id` (BigInt)
- `firstName`, `lastName`, `phone`
- `scheduledAt`, `createdAt`, `status`
- `pinHash`, `pinSalt`, `pinLast4`
- `confirmedAt?`, `checkedInAt?`, `actualEnd?`

## PIN & Queue Logic

- PIN = 8 digits from `HMAC(secret, id|scheduledAt)` + 1 Luhn check digit (total 9).
- Only salted hash + last 4 are stored.
- Validity
  - Active from `scheduledAt - 15m`.
  - Base expiry = `scheduledAt + PIN_VALID_TIME`.
  - Queue floor = `expectedStart + EXTRA_TIME`.
  - Hard cap = `scheduledAt + MAX_EXTENSION_TIME`.
- Queue model (`src/core/queue.ts`)
  - Sort by `scheduledAt`.
  - `expectedStart = max(prevEnd, scheduledAt)`.
  - `prevEnd = actualEnd || expectedStart + SERVICE_TIME`.

## Configuration

Defined in `src/config.ts` (minutes unless stated):

| Key                | Purpose                                  |
| ------------------ | ---------------------------------------- |
| PIN_VALID_TIME     | Base validity after scheduled time       |
| SERVICE_TIME       | Average service duration per reservation |
| EXTRA_TIME         | Extra buffer after expected start        |
| MAX_EXTENSION_TIME | Hard cap from scheduled time             |

## Project Structure

```
src/
  app.ts                      # Express app
  routes/reservations/...     # HTTP routes
  services/reservations/...   # Business logic
  core/pin.ts                 # PIN generation + hashing
  core/queue.ts               # Queue model
  prisma.ts                   # Prisma client
prisma/schema.prisma          # DB schema
tests/                        # Vitest + Supertest
```

## Scripts

```bash
npm run dev        # start dev server
npm run build      # compile TypeScript
npm start          # start compiled server
npm test           # run tests
npx prisma db push # apply schema (non-migrated)
npx prisma studio  # open Prisma Studio
```
