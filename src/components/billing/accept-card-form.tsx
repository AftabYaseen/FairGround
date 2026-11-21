"use client";

import { Lock } from "lucide-react";
import Script from "next/script";
import { useActionState, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { initialFormState, type FormState } from "@/lib/form-state";

type AcceptResponse = {
  messages: { resultCode: "Ok" | "Error"; message: { code: string; text: string }[] };
  opaqueData?: { dataDescriptor: string; dataValue: string };
};
type AcceptGlobal = {
  dispatchData: (
    secureData: {
      authData: { clientKey: string; apiLoginID: string };
      cardData: { cardNumber: string; month: string; year: string; cardCode: string; zip?: string; fullName?: string };
    },
    handler: (r: AcceptResponse) => void,
  ) => void;
};
declare global {
  interface Window {
    Accept?: AcceptGlobal;
  }
}

const ACCEPT_JS = {
  sandbox: "https://jstest.authorize.net/v1/Accept.js",
  production: "https://js.authorize.net/v1/Accept.js",
};

export function AcceptCardForm({
  action,
  submitLabel,
  consent,
  apiLoginId,
  clientKey,
  env,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  consent?: ReactNode;
  apiLoginId: string;
  clientKey: string;
  env: "sandbox" | "production";
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [pending, startTransition] = useTransition();
  const [tokenising, setTokenising] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  // Card fields are read through refs and never have a `name`, so they cannot be submitted.
  const numberRef = useRef<HTMLInputElement>(null);
  const expRef = useRef<HTMLInputElement>(null);
  const cvvRef = useRef<HTMLInputElement>(null);
  const fe = state.fieldErrors ?? {};
  const busy = pending || tokenising;

  function onSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setClientError(null);
    const form = formRef.current;
    if (!form || !window.Accept) {
      setClientError("The secure card form is still loading. Please try again in a moment.");
      return;
    }
    const fd = new FormData(form);
    if (consent && fd.get("consent") !== "on") {
      setClientError("Please tick the box to authorise the charges.");
      return;
    }
    const cardNumber = (numberRef.current?.value ?? "").replace(/\D/g, "");
    const [mm = "", yy = ""] = (expRef.current?.value ?? "").split("/").map((p) => p.trim());
    const cardCode = (cvvRef.current?.value ?? "").trim();
    if (cardNumber.length < 13 || !/^\d{1,2}$/.test(mm) || !/^\d{2}(\d{2})?$/.test(yy) || !/^\d{3,4}$/.test(cardCode)) {
      setClientError("Check the card number, expiry (MM/YY) and security code.");
      return;
    }

    setTokenising(true);
    window.Accept.dispatchData(
      {
        authData: { clientKey, apiLoginID: apiLoginId },
        cardData: {
          cardNumber,
          month: mm.padStart(2, "0"),
          year: yy.length === 2 ? `20${yy}` : yy,
          cardCode,
          zip: String(fd.get("zip") ?? ""),
          fullName: `${fd.get("firstName") ?? ""} ${fd.get("lastName") ?? ""}`.trim(),
        },
      },
      (res) => {
        setTokenising(false);
        if (res.messages.resultCode !== "Ok" || !res.opaqueData) {
          setClientError(res.messages.message?.[0]?.text ?? "The card could not be checked. Please try again.");
          return;
        }
        // Clear the card fields as soon as we have the single-use token.
        if (numberRef.current) numberRef.current.value = "";
        if (cvvRef.current) cvvRef.current.value = "";
        fd.set("dataDescriptor", res.opaqueData.dataDescriptor);
        fd.set("dataValue", res.opaqueData.dataValue);
        startTransition(() => formAction(fd));
      },
    );
  }

  if (state.ok) return <Alert tone="success">{state.message}</Alert>;

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-5" noValidate>
      <Script src={ACCEPT_JS[env]} strategy="afterInteractive" onReady={() => setReady(true)} onLoad={() => setReady(true)} />
      {state.error || clientError ? <Alert tone="danger">{clientError ?? state.error}</Alert> : null}

      <fieldset className="space-y-4 rounded-[10px] border border-line bg-white p-5">
        <legend className="flex items-center gap-2 px-1 text-sm font-semibold">
          <Lock aria-hidden className="size-4" /> Card details
        </legend>
        <Field label="Card number" htmlFor="cc-number">
          <Input id="cc-number" ref={numberRef} inputMode="numeric" autoComplete="cc-number" placeholder="1234 5678 9012 3456" maxLength={23} className="tabular" required />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Expiry (MM/YY)" htmlFor="cc-exp">
            <Input id="cc-exp" ref={expRef} inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" maxLength={7} className="tabular" required />
          </Field>
          <Field label="Security code" htmlFor="cc-csc">
            <Input id="cc-csc" ref={cvvRef} inputMode="numeric" autoComplete="cc-csc" placeholder="123" maxLength={4} className="tabular" required />
          </Field>
        </div>
        <p className="text-sm text-muted">
          Your card goes straight to our payment processor, Authorize.net. FairGround never sees or stores your card number.
        </p>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">Billing address</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor="firstName" error={fe.firstName}>
            <Input id="firstName" name="firstName" autoComplete="cc-given-name" required />
          </Field>
          <Field label="Last name" htmlFor="lastName" error={fe.lastName}>
            <Input id="lastName" name="lastName" autoComplete="cc-family-name" required />
          </Field>
        </div>
        <Field label="Street address" htmlFor="address" error={fe.address}>
          <Input id="address" name="address" autoComplete="address-line1" required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="City" htmlFor="city" error={fe.city}>
            <Input id="city" name="city" autoComplete="address-level2" />
          </Field>
          <Field label="State" htmlFor="state" error={fe.state}>
            <Input id="state" name="state" autoComplete="address-level1" />
          </Field>
          <Field label="ZIP" htmlFor="zip" error={fe.zip}>
            <Input id="zip" name="zip" autoComplete="postal-code" inputMode="numeric" className="tabular" required />
          </Field>
        </div>
      </fieldset>

      {consent ? (
        <label className="flex gap-3 rounded-[6px] border border-line bg-plaster p-4 text-[15px]">
          <Checkbox name="consent" />
          <span>{consent}</span>
        </label>
      ) : null}

      <button type="submit" disabled={busy || !ready} className={buttonClass("primary", "lg", "w-full sm:w-auto")}>
        {!ready ? "Loading secure form" : busy ? "Processing" : submitLabel}
      </button>
    </form>
  );
}
