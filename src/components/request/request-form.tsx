"use client";

import { useActionState } from "react";
import { submitRequest } from "@/app/actions/request";
import { FingerprintInput } from "@/components/auth/fingerprint-input";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/client";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { initialFormState } from "@/lib/form-state";
import { TIMING_OPTIONS } from "@/lib/request-codes";

export function RequestForm({
  providerSlug,
  providerName,
  categories,
  contactName,
  contactEmail,
  contactPhone,
}: {
  providerSlug: string;
  providerName: string;
  categories: { id: string; name: string }[];
  contactName: string;
  contactEmail: string;
  contactPhone: string;
}) {
  const [state, action] = useActionState(submitRequest, initialFormState);
  const v = state.values ?? {};
  const fe = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-6" noValidate>
      {state.error ? (
        <Alert tone="danger" title={state.errorTitle}>
          {state.error}
        </Alert>
      ) : null}
      <input type="hidden" name="provider" value={providerSlug} />

      <Field label="Type of service" htmlFor="category_id" error={fe.category_id}>
        <Select id="category_id" name="category_id" defaultValue={v.category_id ?? (categories.length === 1 ? categories[0].id : "")} required>
          <option value="" disabled>
            Choose a service
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Short title" htmlFor="title" error={fe.title} hint="For example: Replace leaking kitchen faucet">
        <Input id="title" name="title" defaultValue={v.title} maxLength={120} required />
      </Field>

      <Field label="Describe the job" htmlFor="description" error={fe.description} hint="What needs doing, how big it is, access, materials, anything the provider should know.">
        <Textarea id="description" name="description" defaultValue={v.description} maxLength={4000} required className="min-h-40" />
      </Field>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="ZIP code" htmlFor="zip" error={fe.zip}>
          <Input id="zip" name="zip" inputMode="numeric" maxLength={5} defaultValue={v.zip} required className="tabular" autoComplete="postal-code" />
        </Field>
        <Field label="City" htmlFor="city" optional error={fe.city}>
          <Input id="city" name="city" defaultValue={v.city} maxLength={80} autoComplete="address-level2" />
        </Field>
        <Field label="When do you need it?" htmlFor="preferred_timing" error={fe.preferred_timing}>
          <Select id="preferred_timing" name="preferred_timing" defaultValue={v.preferred_timing ?? ""} required>
            <option value="" disabled>
              Choose one
            </option>
            {TIMING_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <fieldset className="space-y-4 rounded-[10px] border border-line bg-plaster p-5">
        <legend className="px-1 text-sm font-semibold">Your contact details (shared with {providerName} only)</legend>
        <Field label="Name" htmlFor="contact_name" error={fe.contact_name}>
          <Input id="contact_name" name="contact_name" defaultValue={v.contact_name ?? contactName} required autoComplete="name" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm font-semibold">Verified email</p>
            <p className="mt-1 break-all text-muted">{contactEmail}</p>
          </div>
          <div>
            <p className="text-sm font-semibold">Verified phone</p>
            <p className="tabular mt-1 text-muted">{contactPhone}</p>
          </div>
        </div>
      </fieldset>

      <FingerprintInput />
      <div className="flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">This request goes to {providerName} only. It is never shared or auctioned.</p>
        <SubmitButton size="lg" pendingText="Sending">
          Send request
        </SubmitButton>
      </div>
    </form>
  );
}
