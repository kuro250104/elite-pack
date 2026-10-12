import { z } from "zod";

const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const password = z.string().min(12, "Le mot de passe doit contenir au moins 12 caractères.")
  .max(128, "Le mot de passe doit contenir au maximum 128 caractères.");
export const registrationSchema = z.object({
  name: z.string().trim().min(2, "Indiquez votre nom.").max(80),
  email,
  password,
  passwordConfirmation: z.string().min(12).max(128),
}).strict().refine((input) => input.password === input.passwordConfirmation, {
  message: "Les mots de passe doivent être identiques.", path: ["passwordConfirmation"],
});
export const loginSchema = z.object({ email, password: z.string().min(1).max(128) }).strict();
