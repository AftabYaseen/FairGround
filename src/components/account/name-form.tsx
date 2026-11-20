"use client";

import { useActionState } from "react";
import { updateAccountName } from "@/app/actions/account";
import { SubmitButton } from "@/components/ui/client";
import { Field, Input } from "@/components/ui/form";
import { initialFormState } from "@/lib/form-state";

export function NameForm({ fullName }: { fullName: string }) {
  const [state, action] = useActionState(updateAccountName, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <Field label="Full name" htmlFor="full_name" error={state.fieldErrors?.full_name ?? state.error} className="flex-1">
        <Input id="full_name" name="full_name" defaultValue={fullName} autoComplete="name" required />
      </Field>
      <div className="flex items-center gap-3">
        <SubmitButton variant="secondary" pendingText="Saving">
          Save
        </SubmitButton>
        {state.ok ? (
          <span className="text-sm font-medium text-success" role="status">
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
