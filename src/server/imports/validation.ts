import { z } from "zod";
export const importCommandSchema = z.discriminatedUnion("kind", [
  z.object({kind: z.literal("sports")}).strict(),
  z.object({kind: z.literal("athlete"), externalId: z.string().regex(/^\d{1,20}$/),
    targetAthleteId: z.string().min(1).max(100).optional()}).strict(),
]);
export type ImportCommand = z.infer<typeof importCommandSchema>;
export const idempotencyKeySchema = z.string().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/);
