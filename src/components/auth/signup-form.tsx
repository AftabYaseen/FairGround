"use client";

import { HardHat, Search } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { signUp } from "@/app/actions/auth";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/client";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { initialFormState } from "@/lib/form-state";
import { FingerprintInput } from "./fingerprint-input";

const ROLES = [
  { value: "provider", label: "I provide services", hint: "Contractors, trades and service businesses", icon: HardHat },
  { value: "client", label: "I need a service", hint: "Send one request to one provider", icon: Search },
] as const;

export function SignupForm({ defaultRole }: { defaultRole?: "provider" | "client" }) {
  const [state, action] = useActionState(signUp, initialFormState);
  const v = state.values ?? {};
  const [role, setRole] = useState<string>(v.role ?? defaultRole ?? "");
  const fe = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-5" noValidate>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <fieldset>
        <legend className="text-sm font-semibold">How will you use FairGround?</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {ROLES.map(({ value, label, hint, icon: Icon }) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer flex-col gap-1 rounded-[6px] border p-4 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-safety",
                role === value ? "border-charcoal bg-plaster ring-1 ring-charcoal" : "border-line hover:border-muted",
              )}
            >
              <input
                type="radio"
                name="role"
                value={value}
                checked={role === value}
                onChange={() => setRole(value)}
                className="sr-only"
              />
              <Icon aria-hidden className="size-5" />
              <span className="font-semibold">{label}</span>
              <span className="text-sm text-muted">{hint}</span>
            </label>
          ))}
        </div>
        {fe.role ? (
          <p className="mt-1.5 text-sm font-medium text-danger" role="alert">
            {fe.role[0]}
          </p>
        ) : null}
      </fieldset>

      <Field label={role === "provider" ? "Your name" : "Full name"} htmlFor="full_name" error={fe.full_name}>
        <Input id="full_name" name="full_name" autoComplete="name" defaultValue={v.full_name} aria-invalid={Boolean(fe.full_name)} required />
      </Field>
      <Field label="Email" htmlFor="email" error={fe.email} hint="We will send you a link to confirm it.">
        <Input id="email" name="email" type="email" autoComplete="email" defaultValue={v.email} aria-invalid={Boolean(fe.email)} required />
      </Field>
      <Field
        label={role === "provider" ? "Business phone" : "Mobile phone"}
        htmlFor="phone"
        error={fe.phone}
        hint={role === "provider" ? "Your main business number." : "We verify it with a text message. One account per number."}
      >
        <Input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="(555) 123-4567" defaultValue={v.phone} aria-invalid={Boolean(fe.phone)} required />
      </Field>
      <Field label="Password" htmlFor="password" error={fe.password} hint="At least 8 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" aria-invalid={Boolean(fe.password)} required />
      </Field>

      <div>
        <label className="flex gap-3 text-[15px]">
          <Checkbox name="terms" defaultChecked={v.terms === "on"} />
          <span>
            I agree to the{" "}
            <Link href="/terms" className="link" target="_blank">
              terms
            </Link>{" "}
            and the{" "}
            <Link href="/fairness-policy" className="link" target="_blank">
              fairness policy
            </Link>
            .
          </span>
        </label>
        {fe.terms ? (
          <p className="mt-1.5 text-sm font-medium text-danger" role="alert">
            {fe.terms[0]}
          </p>
        ) : null}
      </div>

      <FingerprintInput />
      <SubmitButton className="w-full" size="lg" pendingText="Creating your account">
        Create account
      </SubmitButton>
    </form>
  );
}
