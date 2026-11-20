"use client";

import { useActionState } from "react";
import { requestPasswordReset, resendConfirmation, updatePassword } from "@/app/actions/auth";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/client";
import { Field, Input } from "@/components/ui/form";
import { initialFormState } from "@/lib/form-state";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, initialFormState);
  if (state.ok) return <Alert tone="success">{state.message}</Alert>;
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email} required />
      </Field>
      <SubmitButton className="w-full" size="lg" pendingText="Sending">
        Send reset link
      </SubmitButton>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(updatePassword, initialFormState);
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="New password" htmlFor="password" error={fe.password} hint="At least 8 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" aria-invalid={Boolean(fe.password)} required />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm" error={fe.confirm}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" aria-invalid={Boolean(fe.confirm)} required />
      </Field>
      <SubmitButton className="w-full" size="lg" pendingText="Saving">
        Save new password
      </SubmitButton>
    </form>
  );
}

export function ResendConfirmationForm({ email }: { email: string }) {
  const [state, action] = useActionState(resendConfirmation, initialFormState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="email" value={email} />
      {state.message ? <Alert tone="success">{state.message}</Alert> : null}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <SubmitButton variant="secondary" pendingText="Sending">
        Send the link again
      </SubmitButton>
    </form>
  );
}
