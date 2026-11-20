"use client";

import Link from "next/link";
import { useActionState } from "react";
import { resendConfirmation, signIn } from "@/app/actions/auth";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/client";
import { Field, Input } from "@/components/ui/form";
import { initialFormState } from "@/lib/form-state";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signIn, initialFormState);
  const [resendState, resendAction] = useActionState(resendConfirmation, initialFormState);
  const v = state.values ?? {};
  const fe = state.fieldErrors ?? {};

  return (
    <div className="space-y-5">
      <form action={action} className="space-y-5" noValidate>
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        <input type="hidden" name="next" value={next ?? ""} />
        <Field label="Email" htmlFor="email" error={fe.email}>
          <Input id="email" name="email" type="email" autoComplete="email" defaultValue={v.email} aria-invalid={Boolean(fe.email)} required />
        </Field>
        <Field label="Password" htmlFor="password" error={fe.password}>
          <Input id="password" name="password" type="password" autoComplete="current-password" aria-invalid={Boolean(fe.password)} required />
        </Field>
        <div className="flex justify-end">
          <Link href="/forgot-password" className="link text-sm">
            Forgot your password?
          </Link>
        </div>
        <SubmitButton className="w-full" size="lg" pendingText="Logging in">
          Log in
        </SubmitButton>
      </form>

      {v.unconfirmed ? (
        <form action={resendAction} className="rounded-[6px] border border-line bg-plaster p-4">
          <input type="hidden" name="email" value={v.email ?? ""} />
          {resendState.message ? <p className="mb-3 text-sm text-success">{resendState.message}</p> : null}
          {resendState.error ? <p className="mb-3 text-sm text-danger">{resendState.error}</p> : null}
          <p className="text-sm text-muted">Did not get the email?</p>
          <SubmitButton variant="secondary" size="sm" className="mt-2" pendingText="Sending">
            Send the confirmation link again
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
