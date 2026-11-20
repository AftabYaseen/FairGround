"use client";

import { useActionState } from "react";
import { checkPhoneCode, sendPhoneCode } from "@/app/actions/phone";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/client";
import { Field, Input } from "@/components/ui/form";
import { initialFormState } from "@/lib/form-state";

export function PhoneVerifyForm({ phone, next, devBypass }: { phone: string; next?: string; devBypass: boolean }) {
  const [sendState, sendAction] = useActionState(sendPhoneCode, initialFormState);
  const [checkState, checkAction] = useActionState(checkPhoneCode, initialFormState);
  const codeSent = Boolean(sendState.ok) || Boolean(checkState.error);
  const currentPhone = sendState.values?.phone ?? phone;

  return (
    <div className="space-y-6">
      {devBypass ? (
        <Alert tone="warning" title="Development mode">
          Twilio keys are not set and ALLOW_UNVERIFIED_PHONE is on, so no text message is sent. Any 6 digits will verify
          the number.
        </Alert>
      ) : null}

      <form action={sendAction} className="space-y-4" noValidate>
        {sendState.error ? <Alert tone="danger">{sendState.error}</Alert> : null}
        <Field label="Mobile phone" htmlFor="phone" error={sendState.fieldErrors?.phone}>
          <Input id="phone" name="phone" type="tel" autoComplete="tel" defaultValue={currentPhone} required />
        </Field>
        <SubmitButton variant={codeSent ? "secondary" : "primary"} className="w-full" pendingText="Sending code">
          {codeSent ? "Send a new code" : "Text me a code"}
        </SubmitButton>
      </form>

      {codeSent ? (
        <form action={checkAction} className="space-y-4 border-t border-line pt-6" noValidate>
          {sendState.message && !checkState.error ? <Alert tone="success">{sendState.message}</Alert> : null}
          {checkState.error ? <Alert tone="danger">{checkState.error}</Alert> : null}
          <input type="hidden" name="next" value={next ?? ""} />
          <Field label="Verification code" htmlFor="code" error={checkState.fieldErrors?.code}>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d*"
              maxLength={8}
              className="tabular tracking-[0.3em]"
              required
            />
          </Field>
          <SubmitButton className="w-full" size="lg" pendingText="Checking">
            Verify phone
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
