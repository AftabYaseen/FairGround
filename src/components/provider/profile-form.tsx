"use client";

import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useActionState, useRef, useState } from "react";
import { saveProviderProfile } from "@/app/actions/provider";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/client";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { initialFormState } from "@/lib/form-state";

export type ProfileFormInitial = {
  business_name: string;
  tagline: string;
  description: string;
  typical_jobs: string;
  phone_public: string;
  website: string;
  city: string;
  state: string;
  service_zips: string;
  years_in_business: string;
  categories: string[];
  logo_url: string | null;
};

type Category = { id: string; name: string };

const STEPS = [
  { title: "Business", fields: ["business_name", "tagline", "description", "years_in_business", "phone_public", "website"] },
  { title: "Services", fields: ["categories", "typical_jobs"] },
  { title: "Service area", fields: ["city", "state", "service_zips"] },
  { title: "Logo", fields: ["logo"] },
] as const;

export function ProviderProfileForm({
  initial,
  categories,
  mode,
}: {
  initial: ProfileFormInitial;
  categories: Category[];
  mode: "wizard" | "edit";
}) {
  const [state, action] = useActionState(saveProviderProfile, initialFormState);
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fe = state.fieldErrors ?? {};
  const v = state.values;
  const val = (k: keyof ProfileFormInitial) => (v && k in v ? v[k] : (initial[k] as string)) ?? "";
  const selectedCats = v?.categories !== undefined ? v.categories.split(",").filter(Boolean) : initial.categories;

  // After a failed submit, jump to the first step with an error (adjusting state during render).
  const [seenState, setSeenState] = useState(state);
  if (seenState !== state) {
    setSeenState(state);
    if (mode === "wizard" && state.fieldErrors) {
      const idx = STEPS.findIndex((s) => s.fields.some((f) => state.fieldErrors?.[f]));
      if (idx >= 0) setStep(idx);
    }
  }

  const wizard = mode === "wizard";
  const show = (i: number) => !wizard || step === i;

  function next() {
    // Native validation for the visible step before moving on.
    const form = formRef.current;
    if (form) {
      const inputs = Array.from(form.querySelectorAll<HTMLInputElement>(`[data-step="${step}"] [required]`));
      for (const input of inputs) {
        if (!input.reportValidity()) return;
      }
      if (step === 1 && !form.querySelector<HTMLInputElement>('input[name="categories"]:checked')) {
        form.querySelector<HTMLInputElement>('input[name="categories"]')?.focus();
        setStepError("Choose at least one service category.");
        return;
      }
    }
    setStepError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  return (
    <form ref={formRef} action={action} className="space-y-8" noValidate={!wizard}>
      {wizard ? (
        <ol className="grid grid-cols-4 gap-2" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s.title} className="space-y-2">
              <div className={cn("h-1.5 rounded-full", i <= step ? "bg-charcoal" : "bg-line")} />
              <p className={cn("text-xs font-semibold sm:text-sm", i === step ? "text-charcoal" : "text-muted")}>
                <span className="sr-only">Step {i + 1}: </span>
                {s.title}
              </p>
            </li>
          ))}
        </ol>
      ) : null}

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

      <section data-step="0" hidden={!show(0)} className="space-y-5">
        {wizard ? <h2 className="text-2xl">Tell clients about your business</h2> : <h2 className="text-[22px]">Business</h2>}
        <Field label="Business name" htmlFor="business_name" error={fe.business_name}>
          <Input id="business_name" name="business_name" defaultValue={val("business_name")} required maxLength={120} />
        </Field>
        <Field label="Tagline" htmlFor="tagline" optional error={fe.tagline} hint="One line, for example: Licensed plumber serving Tampa since 2009.">
          <Input id="tagline" name="tagline" defaultValue={val("tagline")} maxLength={160} />
        </Field>
        <Field label="About your business" htmlFor="description" optional error={fe.description}>
          <Textarea id="description" name="description" defaultValue={val("description")} maxLength={4000} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Years in business" htmlFor="years_in_business" optional error={fe.years_in_business}>
            <Input id="years_in_business" name="years_in_business" inputMode="numeric" defaultValue={val("years_in_business")} />
          </Field>
          <Field label="Public phone" htmlFor="phone_public" optional error={fe.phone_public}>
            <Input id="phone_public" name="phone_public" type="tel" defaultValue={val("phone_public")} maxLength={30} />
          </Field>
          <Field label="Website" htmlFor="website" optional error={fe.website}>
            <Input id="website" name="website" defaultValue={val("website")} placeholder="example.com" />
          </Field>
        </div>
      </section>

      <section data-step="1" hidden={!show(1)} className="space-y-5">
        {wizard ? <h2 className="text-2xl">What services do you offer?</h2> : <h2 className="text-[22px]">Services</h2>}
        <fieldset>
          <legend className="text-sm font-semibold">Service categories (up to 8)</legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((c) => (
              <label key={c.id} className="flex items-start gap-3 rounded-[6px] border border-line bg-white px-3 py-2.5 hover:border-muted">
                <Checkbox name="categories" value={c.id} defaultChecked={selectedCats.includes(c.id)} className="mt-0.5" />
                <span className="text-[15px]">{c.name}</span>
              </label>
            ))}
          </div>
          {fe.categories || stepError ? (
            <p className="mt-2 text-sm font-medium text-danger" role="alert">
              {fe.categories?.[0] ?? stepError}
            </p>
          ) : null}
        </fieldset>
        <Field label="Typical jobs" htmlFor="typical_jobs" optional error={fe.typical_jobs} hint="Help clients pick the right provider: the jobs you do most often.">
          <Textarea id="typical_jobs" name="typical_jobs" defaultValue={val("typical_jobs")} maxLength={1000} className="min-h-24" />
        </Field>
      </section>

      <section data-step="2" hidden={!show(2)} className="space-y-5">
        {wizard ? <h2 className="text-2xl">Where do you work?</h2> : <h2 className="text-[22px]">Service area</h2>}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="City" htmlFor="city" error={fe.city}>
            <Input id="city" name="city" defaultValue={val("city")} required maxLength={80} autoComplete="address-level2" />
          </Field>
          <Field label="State" htmlFor="state" error={fe.state}>
            <Input id="state" name="state" defaultValue={val("state")} required maxLength={40} autoComplete="address-level1" />
          </Field>
        </div>
        <Field
          label="ZIP codes you serve"
          htmlFor="service_zips"
          error={fe.service_zips}
          hint="Separate with commas or spaces. Clients filter the directory by ZIP."
        >
          <Textarea id="service_zips" name="service_zips" defaultValue={val("service_zips")} required className="tabular min-h-24" placeholder="33602, 33603, 33604" />
        </Field>
      </section>

      <section data-step="3" hidden={!show(3)} className="space-y-5">
        {wizard ? <h2 className="text-2xl">Add your logo</h2> : <h2 className="text-[22px]">Logo</h2>}
        {initial.logo_url ? (
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- small preview of a user upload */}
            <img src={initial.logo_url} alt="Current logo" className="size-20 rounded-[10px] border border-line bg-white object-contain" />
            <label className="flex items-center gap-2 text-[15px]">
              <Checkbox name="remove_logo" className="mt-0" />
              Remove current logo
            </label>
          </div>
        ) : null}
        <Field label={initial.logo_url ? "Replace logo" : "Logo"} htmlFor="logo" optional error={fe.logo} hint="PNG, JPG or WebP, up to 2 MB. A square image works best.">
          <Input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="h-auto py-2" />
        </Field>
        {wizard ? (
          <Alert tone="info" title="Almost done">
            When you finish, your public page and request link go live. You can edit everything later.
          </Alert>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
        {wizard ? (
          <>
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              <ArrowLeft aria-hidden className="size-4" /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={next}>
                Next <ArrowRight aria-hidden className="size-4" />
              </Button>
            ) : (
              <SubmitButton pendingText="Publishing">
                <Check aria-hidden className="size-4" /> Publish my profile
              </SubmitButton>
            )}
          </>
        ) : (
          <SubmitButton pendingText="Saving">Save changes</SubmitButton>
        )}
      </div>
    </form>
  );
}
