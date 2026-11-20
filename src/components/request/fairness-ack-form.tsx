"use client";

import { ShieldCheck } from "lucide-react";
import { useActionState } from "react";
import { acceptFairness } from "@/app/actions/request";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/client";
import { Checkbox } from "@/components/ui/form";
import { initialFormState } from "@/lib/form-state";

export function FairnessAckForm({ statement }: { statement: string }) {
  const [state, action] = useActionState(acceptFairness, initialFormState);
  return (
    <form action={action} className="space-y-5">
      <div className="rounded-[10px] border-2 border-charcoal bg-white">
        <div aria-hidden className="safety-stripe h-2 rounded-t-[8px]" />
        <div className="space-y-4 p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck aria-hidden className="size-6 text-charcoal" />
            <h2 className="text-[22px]">Our fairness statement</h2>
          </div>
          <blockquote className="border-l-4 border-safety pl-4 text-lg leading-relaxed">{statement}</blockquote>
        </div>
      </div>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <label className="flex gap-3 rounded-[6px] border border-line bg-white p-4 text-[15px]">
        <Checkbox name="agree" required />
        <span>I understand and agree. I will submit one active request to one provider at a time.</span>
      </label>
      <SubmitButton size="lg" pendingText="Saving">
        Agree and continue
      </SubmitButton>
    </form>
  );
}
