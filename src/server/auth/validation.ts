import { z } from "zod";

const email = z.string("Indiquez votre adresse e-mail.").trim().toLowerCase()
  .max(254, "L’adresse e-mail est trop longue.").pipe(z.email("Cette adresse e-mail n’est pas valide."));
const password = z.string("Indiquez un mot de passe.").min(12, "Le mot de passe doit contenir au moins 12 caractères.")
  .max(128, "Le mot de passe doit contenir au maximum 128 caractères.");
export const registrationSchema = z.object({
  name: z.string("Indiquez votre nom.").trim().min(2, "Le nom doit contenir au moins 2 caractères.")
    .max(80, "Le nom doit contenir au maximum 80 caractères."),
  email,
  password,
  passwordConfirmation: z.string("Confirmez votre mot de passe.").max(128, "Le mot de passe doit contenir au maximum 128 caractères."),
}).strict().refine((input) => input.password === input.passwordConfirmation, {
  message: "Les mots de passe doivent être identiques.", path: ["passwordConfirmation"],
});
export const loginSchema = z.object({ email, password: z.string().min(1).max(128) }).strict();
