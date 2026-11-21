"use client";

import { useActionState } from "react";
import { adminUpdateSettings } from "@/app/actions/admin";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/client";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { initialFormState } from "@/lib/form-state";
import type { Tables } from "@/types/database";

const cents = (v: number) => (v / 100).toFixed(2);

export function AdminSettingsForm({ s }: { s: Tables<"app_settings"> }) {
  const [state, action] = useActionState(adminUpdateSettings, initialFormState);
  const fe = state.fieldErrors ?? {};
  const money = (name: string, label: string, value: number) => (
    <Field label={label} htmlFor={name} error={fe[name]}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
        <Input id={name} name={name} defaultValue={cents(value)} inputMode="decimal" className="tabular pl-7" />
      </div>
    </Field>
  );

  return (
    <form action={action} className="space-y-8">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

      <section className="space-y-4">
        <h2 className="text-[22px]">Requests</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Request expiry (days)" htmlFor="request_expiry_days" error={fe.request_expiry_days} hint="Applies to new requests.">
            <Input id="request_expiry_days" name="request_expiry_days" defaultValue={s.request_expiry_days} inputMode="numeric" className="tabular" />
          </Field>
          <Field label="Included requests per month" htmlFor="included_requests" error={fe.included_requests} hint="Default for new providers. Change existing ones on the Providers page.">
            <Input id="included_requests" name="included_requests" defaultValue={s.included_requests} inputMode="numeric" className="tabular" />
          </Field>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-[22px]">Founding member beta</h2>
        <label className="flex gap-3 text-[15px]">
          <Checkbox name="beta_open" defaultChecked={s.beta_open} />
          <span>Beta is open (new providers join on founding pricing)</span>
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Sign-up deadline" htmlFor="beta_signup_deadline" optional error={fe.beta_signup_deadline} hint="Empty shows Limited founding spots available.">
            <Input id="beta_signup_deadline" name="beta_signup_deadline" type="date" defaultValue={s.beta_signup_deadline ?? ""} />
          </Field>
          <Field label="General availability date" htmlFor="ga_launch_date" optional error={fe.ga_launch_date}>
            <Input id="ga_launch_date" name="ga_launch_date" type="date" defaultValue={s.ga_launch_date ?? ""} />
          </Field>
          <Field label="Founding spots" htmlFor="beta_capacity" error={fe.beta_capacity}>
            <Input id="beta_capacity" name="beta_capacity" defaultValue={s.beta_capacity} inputMode="numeric" className="tabular" />
          </Field>
        </div>
        <Field label="Founding price lock (months)" htmlFor="founding_lock_months" error={fe.founding_lock_months} className="sm:max-w-xs">
          <Input id="founding_lock_months" name="founding_lock_months" defaultValue={s.founding_lock_months} inputMode="numeric" className="tabular" />
        </Field>
      </section>

      <section className="space-y-4">
        <h2 className="text-[22px]">Pricing</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {money("beta_monthly", "Founding monthly", s.beta_monthly_cents)}
          {money("beta_setup", "Founding setup", s.beta_setup_cents)}
          {money("beta_overage", "Founding extra request", s.beta_overage_cents)}
          {money("std_monthly", "Standard monthly", s.std_monthly_cents)}
          {money("std_setup", "Standard setup", s.std_setup_cents)}
          {money("std_overage", "Standard extra request", s.std_overage_cents)}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-[22px]">Fairness statement</h2>
        <Field label={`Statement (version ${s.fairness_statement_version})`} htmlFor="fairness_statement" error={fe.fairness_statement}>
          <Textarea id="fairness_statement" name="fairness_statement" defaultValue={s.fairness_statement} maxLength={1000} />
        </Field>
        <label className="flex gap-3 text-[15px]">
          <Checkbox name="bump_version" />
          <span>Publish as a new version. Every client must agree again before their next request.</span>
        </label>
      </section>

      <SubmitButton size="lg" pendingText="Saving">
        Save settings
      </SubmitButton>
    </form>
  );
}
