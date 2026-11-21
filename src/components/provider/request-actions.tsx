"use client";

import { useActionState, useState } from "react";
import { providerCloseRequest } from "@/app/actions/inbox";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/client";
import { Field, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { initialFormState } from "@/lib/form-state";

type Mode = "completed" | "closed_by_provider" | "declined" | null;

const OUTCOMES = [
  { value: "hired", label: "Hired" },
  { value: "not_hired", label: "Not hired" },
  { value: "no_response", label: "No response" },
] as const;

export function RequestActions({ requestId }: { requestId: string }) {
  const [state, action] = useActionState(providerCloseRequest, initialFormState);
  const [mode, setMode] = useState<Mode>(null);

  if (state.ok) return <Alert tone="success">{state.message}</Alert>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant={mode === "completed" ? "primary" : "secondary"} onClick={() => setMode("completed")}>
          Mark completed
        </Button>
        <Button variant={mode === "closed_by_provider" ? "primary" : "secondary"} onClick={() => setMode("closed_by_provider")}>
          Close request
        </Button>
        <Button variant={mode === "declined" ? "danger" : "ghost"} onClick={() => setMode("declined")}>
          Decline
        </Button>
      </div>

      {mode ? (
        <form action={action} className="space-y-4 rounded-[10px] border border-line bg-plaster p-5">
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          <input type="hidden" name="request_id" value={requestId} />
          <input type="hidden" name="status" value={mode} />
          {mode === "declined" ? (
            <p className="text-[15px]">
              Declining tells the client you cannot take this job, so they can send it to another provider. If you can do
              part of it, consider partnering with another provider instead.
            </p>
          ) : (
            <fieldset>
              <legend className="text-sm font-semibold">Outcome (required)</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {OUTCOMES.map((o) => (
                  <label
                    key={o.value}
                    className={cn(
                      "cursor-pointer rounded-[6px] border border-line bg-white px-4 py-2 text-[15px] font-medium has-[:checked]:border-charcoal has-[:checked]:bg-charcoal has-[:checked]:text-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-safety",
                    )}
                  >
                    <input type="radio" name="outcome" value={o.value} className="sr-only" required />
                    {o.label}
                  </label>
                ))}
              </div>
              {state.fieldErrors?.outcome ? (
                <p className="mt-2 text-sm font-medium text-danger" role="alert">
                  {state.fieldErrors.outcome[0]}
                </p>
              ) : null}
            </fieldset>
          )}
          <Field label="Note" htmlFor="note" optional hint="Private to you and FairGround.">
            <Textarea id="note" name="note" maxLength={1000} className="min-h-20" />
          </Field>
          <div className="flex flex-wrap gap-3">
            <SubmitButton variant={mode === "declined" ? "danger" : "primary"} pendingText="Saving">
              {mode === "declined" ? "Decline request" : mode === "completed" ? "Mark completed" : "Close request"}
            </SubmitButton>
            <Button variant="ghost" onClick={() => setMode(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
