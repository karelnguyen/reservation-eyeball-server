-- CreateTable
CREATE TABLE "public"."Reservation" (
    "id" BIGSERIAL NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "pinHash" TEXT NOT NULL,
    "pinSalt" TEXT NOT NULL,
    "pinLast4" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'booked',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "checkedInAt" TIMESTAMP(3),

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reservation_scheduledAt_idx" ON "public"."Reservation"("scheduledAt");

-- CreateIndex
CREATE INDEX "Reservation_status_scheduledAt_idx" ON "public"."Reservation"("status", "scheduledAt");
