"use client";

import { useActionState } from "react";
import { setOverageOptIn, setRequestsPaused } from "@/app/actions/inbox";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/client";
import { Checkbox } from "@/components/ui/form";
import { initialFormState } from "@/lib/form-state";

export function PauseForm({ paused, reason }: { paused: boolean; reason: string | null }) {
  const [state, action] = useActionState(setRequestsPaused, initialFormState);
  const lockedByFairGround = paused && (reason === "admin" || reason === "billing");
  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{state.message}</Alert> : null}
      <input type="hidden" name="paused" value={paused ? "false" : "true"} />
      {lockedByFairGround ? (
        <p className="text-[15px] text-muted">This pause was set by FairGround. Please contact us to lift it.</p>
      ) : (
        <SubmitButton variant={paused ? "primary" : "secondary"} size="lg" pendingText="Saving">
          {paused ? "Resume requests" : "Pause new requests"}
        </SubmitButton>
      )}
    </form>
  );
}

export function OverageForm({ optIn, priceLabel }: { optIn: boolean; priceLabel: string }) {
  const [state, action] = useActionState(setOverageOptIn, initialFormState);
  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{state.message}</Alert> : null}
      <input type="hidden" name="opt_in" value={optIn ? "false" : "true"} />
      {!optIn ? (
        <label className="flex gap-3 text-[15px]">
          <Checkbox name="confirm" />
          <span>
            I agree to pay <strong className="tabular">{priceLabel}</strong> for each request I receive after my included
            requests this month.
          </span>
        </label>
      ) : null}
      <SubmitButton variant={optIn ? "secondary" : "steel"} pendingText="Saving">
        {optIn ? "Turn off extra requests" : "Turn on extra requests"}
      </SubmitButton>
    </form>
  );
}
