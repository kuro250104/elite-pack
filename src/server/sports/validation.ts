import { z } from "zod";
export const sportPatchSchema = z.object({nameFr: z.string().trim().min(2).max(100).optional(), active: z.boolean().optional()})
  .strict().refine(value => Object.keys(value).length > 0);
export type SportPatch = z.infer<typeof sportPatchSchema>;
