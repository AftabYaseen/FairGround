"use client";

import { useActionState, useState } from "react";
import { closeMyRequest } from "@/app/actions/request";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/client";
import { Field, Select } from "@/components/ui/form";
import { initialFormState } from "@/lib/form-state";

export function CloseRequestForm({ requestId }: { requestId: string }) {
  const [state, action] = useActionState(closeMyRequest, initialFormState);
  const [open, setOpen] = useState(false);

  if (state.ok) return <Alert tone="success">{state.message}</Alert>;

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Close this request
      </Button>
    );
  }

  return (
    <form action={action} className="space-y-4 rounded-[10px] border border-line bg-plaster p-5">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <input type="hidden" name="request_id" value={requestId} />
      <p className="font-semibold">Close this request?</p>
      <p className="text-[15px] text-muted">
        Closing is final. Afterwards you can send a new request. Sending the same job to another provider within 72 hours
        counts as shopping around, unless the provider declined it.
      </p>
      <Field label="Did you hire them?" htmlFor="outcome" optional>
        <Select id="outcome" name="outcome" defaultValue="">
          <option value="">Prefer not to say</option>
          <option value="hired">Yes, I hired them</option>
          <option value="not_hired">No, I did not hire them</option>
          <option value="no_response">They did not respond</option>
        </Select>
      </Field>
      <div className="flex flex-wrap gap-3">
        <SubmitButton variant="danger" pendingText="Closing">
          Yes, close it
        </SubmitButton>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Keep it open
        </Button>
      </div>
    </form>
  );
}
