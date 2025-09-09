import { z } from 'zod';

export const CreateReservationSchema = z.object({
  firstName: z.string().trim().min(1, 'firstName is required'),
  lastName: z.string().trim().min(1, 'lastName is required'),
  phone: z
    .string()
    .trim()
    .min(7, 'phone must have at least 7 digits')
    .max(20, 'phone too long'),
  scheduledAt: z
    .string()
    .datetime({ offset: true, message: 'scheduledAt must be ISO date' }),
});

export const ConfirmPinSchema = z.object({
  pin: z.string().regex(/^\d{4,9}$/, 'pin must be 4-9 digits'),
});

export type CreateReservationInput = z.infer<typeof CreateReservationSchema>;
