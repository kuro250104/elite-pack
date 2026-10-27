"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const failureMessage = "Connexion impossible. Vérifiez vos identifiants ou réessayez plus tard.";

export function LoginForm({ initialError = false }: { initialError?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(initialError ? failureMessage : "");
  const locked = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (locked.current) return;
    const fields = new FormData(event.currentTarget);
    const email = String(fields.get("email") ?? "").trim();
    const password = String(fields.get("password") ?? "");
    locked.current = true; setPending(true); setError("");
    try {
      const result = await signIn("credentials", { email, password, redirect: false });
      if (!result?.ok || result.error) { setError(failureMessage); return; }
      router.push("/dashboard"); router.refresh();
    } catch { setError(failureMessage); }
    finally { locked.current = false; setPending(false); }
  }
  return <form onSubmit={submit} className="min-w-0 space-y-4" aria-describedby="login-feedback">
    <fieldset disabled={pending} className="min-w-0 space-y-4">
      <legend className="sr-only">Connexion avec une adresse e-mail et un mot de passe</legend>
      <div className="space-y-2"><label htmlFor="login-email" className="text-sm font-medium">Adresse e-mail</label><Input id="login-email" name="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} maxLength={254} required /></div>
      <div className="space-y-2"><label htmlFor="login-password" className="text-sm font-medium">Mot de passe</label><Input id="login-password" name="password" type="password" autoComplete="current-password" minLength={12} maxLength={128} required /></div>
      <Button type="submit" className="w-full">{pending ? "Connexion en cours…" : "Se connecter"}</Button>
    </fieldset>
    <div id="login-feedback" aria-live="polite" aria-atomic="true">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {pending && <p role="status" className="text-sm text-muted-foreground">Vérification des identifiants…</p>}
    </div>
  </form>;
}
