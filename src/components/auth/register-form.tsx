"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Field = "name" | "email" | "password" | "passwordConfirmation";
type FieldErrors = Partial<Record<Field, string>>;
const networkFailure = "Le serveur ne répond pas. Vérifiez votre connexion ou réessayez dans quelques instants.";

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} className="text-sm text-destructive">{message}</p> : null;
}

export function RegisterForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const locked = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (locked.current) return;
    const fields = new FormData(event.currentTarget);
    const name = String(fields.get("name") ?? "").trim();
    const email = String(fields.get("email") ?? "").trim();
    const password = String(fields.get("password") ?? "");
    const passwordConfirmation = String(fields.get("passwordConfirmation") ?? "");
    if (password !== passwordConfirmation) {
      setError(""); setFieldErrors({ passwordConfirmation: "Les mots de passe doivent être identiques." }); return;
    }
    locked.current = true; setPending(true); setError(""); setFieldErrors({});
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, passwordConfirmation }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: { message?: string; fields?: FieldErrors } } | null;
        const reported = body?.error?.fields ?? {};
        setFieldErrors(reported);
        if (Object.keys(reported).length === 0) setError(body?.error?.message ?? networkFailure);
        return;
      }
      // The account exists at this point; a failed automatic sign-in falls back to the login page.
      const login = await signIn("credentials", { email, password, redirect: false });
      if (!login?.ok || login.error) { router.push("/connexion?registered=1"); return; }
      router.push("/dashboard"); router.refresh();
    } catch { setError(networkFailure); }
    finally { locked.current = false; setPending(false); }
  }
  const describedBy = (field: Field, help?: string) =>
    [help, fieldErrors[field] ? `register-${field}-error` : undefined].filter(Boolean).join(" ") || undefined;
  return <form onSubmit={submit} className="min-w-0 space-y-4" aria-describedby="registration-feedback" noValidate>
    <fieldset disabled={pending} className="min-w-0 space-y-4">
      <legend className="sr-only">Inscription avec une adresse e-mail et un mot de passe</legend>
      <div className="space-y-2">
        <label htmlFor="register-name" className="text-sm font-medium">Nom affiché</label>
        <Input id="register-name" name="name" autoComplete="nickname" minLength={2} maxLength={80} required
          aria-invalid={Boolean(fieldErrors.name)} aria-describedby={describedBy("name")} />
        <FieldError id="register-name-error" message={fieldErrors.name} />
      </div>
      <div className="space-y-2">
        <label htmlFor="register-email" className="text-sm font-medium">Adresse e-mail</label>
        <Input id="register-email" name="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} maxLength={254} required
          aria-invalid={Boolean(fieldErrors.email)} aria-describedby={describedBy("email")} />
        <FieldError id="register-email-error" message={fieldErrors.email} />
      </div>
      <div className="space-y-2">
        <label htmlFor="register-password" className="text-sm font-medium">Mot de passe</label>
        <Input id="register-password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required
          aria-invalid={Boolean(fieldErrors.password)} aria-describedby={describedBy("password", "password-help")} />
        <p id="password-help" className="text-xs text-muted-foreground">Au moins 12 caractères. Une phrase de passe est plus simple à retenir.</p>
        <FieldError id="register-password-error" message={fieldErrors.password} />
      </div>
      <div className="space-y-2">
        <label htmlFor="register-confirmation" className="text-sm font-medium">Confirmer le mot de passe</label>
        <Input id="register-confirmation" name="passwordConfirmation" type="password" autoComplete="new-password" maxLength={128} required
          aria-invalid={Boolean(fieldErrors.passwordConfirmation)} aria-describedby={describedBy("passwordConfirmation")} />
        <FieldError id="register-passwordConfirmation-error" message={fieldErrors.passwordConfirmation} />
      </div>
      <Button type="submit" className="w-full">{pending ? "Création en cours…" : "Créer mon compte"}</Button>
    </fieldset>
    <div id="registration-feedback" aria-live="polite" aria-atomic="true">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {Object.keys(fieldErrors).length > 0 && <p role="alert" className="text-sm text-destructive">Vérifiez les champs indiqués.</p>}
      {pending && <p role="status" className="text-sm text-muted-foreground">Création du compte…</p>}
    </div>
  </form>;
}
