"use client";

import { useActionState, useState } from "react";
import { cancelBilling } from "@/app/actions/billing";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/client";
import { Field, Input } from "@/components/ui/form";
import { initialFormState } from "@/lib/form-state";

export function CancelSubscriptionForm({ paidThrough }: { paidThrough: string | null }) {
  const [state, action] = useActionState(cancelBilling, initialFormState);
  const [open, setOpen] = useState(false);
  if (state.ok) return <Alert tone="success">{state.message}</Alert>;
  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Cancel subscription
      </Button>
    );
  }
  return (
    <form action={action} className="space-y-4 rounded-[10px] border border-line bg-plaster p-5">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <p className="text-[15px]">
        No more monthly charges after you cancel. {paidThrough ? `You keep receiving requests until ${paidThrough}. ` : ""}
        Your profile stays listed, but clients will see that you are not accepting requests. You can start again at any time.
      </p>
      <Field label="Type CANCEL to confirm" htmlFor="confirm">
        <Input id="confirm" name="confirm" autoComplete="off" className="max-w-48" />
      </Field>
      <div className="flex flex-wrap gap-3">
        <SubmitButton variant="danger" pendingText="Canceling">
          Cancel subscription
        </SubmitButton>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Keep my subscription
        </Button>
      </div>
    </form>
  );
}
