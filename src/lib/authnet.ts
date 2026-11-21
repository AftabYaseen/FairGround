import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Authorize.net JSON API client (CIM customer profiles, transactions, ARB).
 * Card numbers never reach this code: the browser sends Accept.js `opaqueData` (a single-use
 * nonce, valid 15 minutes) and Authorize.net stores the card in a customer profile.
 *
 * Element order matters: the JSON API is translated to XML, so objects below follow the
 * order of the API reference.
 */

export type AuthnetEnv = "sandbox" | "production";
export type OpaqueData = { dataDescriptor: string; dataValue: string };
export type BillTo = {
  firstName: string;
  lastName: string;
  company?: string;
  address: string;
  city?: string;
  state?: string;
  zip: string;
  country?: string;
};

type ApiMessage = { code: string; text: string };
type ApiResponse = { messages?: { resultCode: "Ok" | "Error"; message?: ApiMessage[] } } & Record<string, unknown>;

export type Failure = { ok: false; code: string; message: string };

export function authnetEnv(): AuthnetEnv {
  return process.env.NEXT_PUBLIC_AUTHNET_ENV === "production" ? "production" : "sandbox";
}

function credentials() {
  const name = process.env.NEXT_PUBLIC_AUTHNET_API_LOGIN_ID;
  const transactionKey = process.env.AUTHNET_TRANSACTION_KEY;
  if (!name || !transactionKey) return null;
  return { name, transactionKey };
}

export function isAuthnetConfigured(): boolean {
  return credentials() !== null && Boolean(process.env.NEXT_PUBLIC_AUTHNET_CLIENT_KEY);
}

const ENDPOINT: Record<AuthnetEnv, string> = {
  sandbox: "https://apitest.authorize.net/xml/v1/request.api",
  production: "https://api.authorize.net/xml/v1/request.api",
};

function cents(amountCents: number): string {
  return (amountCents / 100).toFixed(2);
}

function firstMessage(res: ApiResponse): ApiMessage {
  return res.messages?.message?.[0] ?? { code: "UNKNOWN", text: "Unknown response from the payment processor." };
}

async function call<T extends ApiResponse>(root: string, body: Record<string, unknown>): Promise<T | Failure> {
  const creds = credentials();
  if (!creds) return { ok: false, code: "NOT_CONFIGURED", message: "Payments are not configured." };
  try {
    const res = await fetch(ENDPOINT[authnetEnv()], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [root]: { merchantAuthentication: creds, ...body } }),
      cache: "no-store",
    });
    // Authorize.net JSON responses can start with a byte order mark.
    const text = (await res.text()).replace(/^﻿/, "");
    const json = JSON.parse(text) as T;
    return json;
  } catch (err) {
    console.error(`[authnet] ${root} request failed:`, err);
    return { ok: false, code: "NETWORK", message: "Could not reach the payment processor." };
  }
}

function isFailure(v: unknown): v is Failure {
  return typeof v === "object" && v !== null && (v as Failure).ok === false;
}

function apiFailure(res: ApiResponse): Failure | null {
  if (res.messages?.resultCode === "Ok") return null;
  const m = firstMessage(res);
  return { ok: false, code: m.code, message: m.text };
}

// ---------------------------------------------------------------------------
// Customer profiles (CIM)
// ---------------------------------------------------------------------------

function validationMode(): "liveMode" | "testMode" {
  // liveMode runs a $0/$0.01 authorisation that is voided; testMode only validates fields.
  return authnetEnv() === "production" ? "liveMode" : "testMode";
}

function billToJson(b: BillTo) {
  return {
    firstName: b.firstName.slice(0, 50),
    lastName: b.lastName.slice(0, 50),
    company: b.company?.slice(0, 50),
    address: b.address.slice(0, 60),
    city: b.city?.slice(0, 40),
    state: b.state?.slice(0, 40),
    zip: b.zip.slice(0, 20),
    country: (b.country ?? "US").slice(0, 60),
  };
}

export async function createCustomerProfile(input: {
  merchantCustomerId: string;
  description: string;
  email: string;
  billTo: BillTo;
  opaqueData: OpaqueData;
}): Promise<{ ok: true; customerProfileId: string; paymentProfileId: string } | Failure> {
  const res = await call<ApiResponse & { customerProfileId?: string; customerPaymentProfileIdList?: string[] }>(
    "createCustomerProfileRequest",
    {
      profile: {
        merchantCustomerId: input.merchantCustomerId.slice(0, 20),
        description: input.description.slice(0, 255),
        email: input.email.slice(0, 255),
        paymentProfiles: {
          customerType: "business",
          billTo: billToJson(input.billTo),
          payment: { opaqueData: input.opaqueData },
        },
      },
      validationMode: validationMode(),
    },
  );
  if (isFailure(res)) return res;
  const fail = apiFailure(res);
  if (fail) {
    // E00039: a profile already exists for this customer. Reuse it and add the card to it.
    const existing = fail.code === "E00039" ? fail.message.match(/ID\s+(\d+)/)?.[1] : undefined;
    if (existing) {
      const added = await createPaymentProfile({ customerProfileId: existing, billTo: input.billTo, opaqueData: input.opaqueData });
      if (!added.ok) return added;
      return { ok: true, customerProfileId: existing, paymentProfileId: added.paymentProfileId };
    }
    return fail;
  }
  const paymentProfileId = res.customerPaymentProfileIdList?.[0];
  if (!res.customerProfileId || !paymentProfileId) {
    return { ok: false, code: "NO_PROFILE", message: "The payment processor did not return a profile." };
  }
  return { ok: true, customerProfileId: res.customerProfileId, paymentProfileId };
}

export async function createPaymentProfile(input: {
  customerProfileId: string;
  billTo: BillTo;
  opaqueData: OpaqueData;
}): Promise<{ ok: true; paymentProfileId: string } | Failure> {
  const res = await call<ApiResponse & { customerPaymentProfileId?: string }>("createCustomerPaymentProfileRequest", {
    customerProfileId: input.customerProfileId,
    paymentProfile: {
      customerType: "business",
      billTo: billToJson(input.billTo),
      payment: { opaqueData: input.opaqueData },
    },
    validationMode: validationMode(),
  });
  if (isFailure(res)) return res;
  const fail = apiFailure(res);
  if (fail) return fail;
  if (!res.customerPaymentProfileId) return { ok: false, code: "NO_PROFILE", message: "No payment profile returned." };
  return { ok: true, paymentProfileId: res.customerPaymentProfileId };
}

export async function getCardSummary(customerProfileId: string, paymentProfileId: string) {
  const res = await call<
    ApiResponse & { paymentProfile?: { payment?: { creditCard?: { cardNumber?: string; expirationDate?: string; cardType?: string } } } }
  >("getCustomerPaymentProfileRequest", {
    customerProfileId,
    customerPaymentProfileId: paymentProfileId,
    unmaskExpirationDate: true,
  });
  if (isFailure(res) || apiFailure(res)) return null;
  const card = res.paymentProfile?.payment?.creditCard;
  if (!card) return null;
  const last4 = card.cardNumber?.replace(/\D/g, "").slice(-4) ?? null;
  const exp = card.expirationDate && /^\d{4}-\d{2}$/.test(card.expirationDate)
    ? `${card.expirationDate.slice(5, 7)}/${card.expirationDate.slice(0, 4)}`
    : null;
  return { brand: card.cardType ?? null, last4: last4 && /^\d{4}$/.test(last4) ? last4 : null, exp };
}

export async function deletePaymentProfile(customerProfileId: string, paymentProfileId: string): Promise<boolean> {
  const res = await call<ApiResponse>("deleteCustomerPaymentProfileRequest", {
    customerProfileId,
    customerPaymentProfileId: paymentProfileId,
  });
  return !isFailure(res) && !apiFailure(res);
}

// ---------------------------------------------------------------------------
// One-off charges against a customer profile
// ---------------------------------------------------------------------------

export type ChargeResult =
  | { ok: true; status: "approved"; transId: string }
  | { ok: false; status: "declined" | "error" | "held"; transId: string | null; code: string; message: string };

type TransactionResponse = {
  responseCode?: string;
  transId?: string;
  messages?: { code: string; description: string }[];
  errors?: { errorCode: string; errorText: string }[];
};

export async function chargeProfile(input: {
  customerProfileId: string;
  paymentProfileId: string;
  amountCents: number;
  invoiceNumber: string;
  description: string;
}): Promise<ChargeResult> {
  const res = await call<ApiResponse & { transactionResponse?: TransactionResponse }>("createTransactionRequest", {
    refId: input.invoiceNumber.slice(0, 20),
    transactionRequest: {
      transactionType: "authCaptureTransaction",
      amount: cents(input.amountCents),
      profile: {
        customerProfileId: input.customerProfileId,
        paymentProfile: { paymentProfileId: input.paymentProfileId },
      },
      order: { invoiceNumber: input.invoiceNumber.slice(0, 20), description: input.description.slice(0, 255) },
    },
  });
  if (isFailure(res)) return { ok: false, status: "error", transId: null, code: res.code, message: res.message };
  const tr = res.transactionResponse;
  const transId = tr?.transId && tr.transId !== "0" ? tr.transId : null;
  if (tr?.responseCode === "1" && transId) return { ok: true, status: "approved", transId };
  const err = tr?.errors?.[0];
  const top = firstMessage(res);
  const status = tr?.responseCode === "2" ? "declined" : tr?.responseCode === "4" ? "held" : "error";
  return {
    ok: false,
    status,
    transId,
    code: err?.errorCode ?? top.code,
    message: err?.errorText ?? tr?.messages?.[0]?.description ?? top.text,
  };
}

export async function getTransactionDetails(transId: string) {
  const res = await call<
    ApiResponse & {
      transaction?: {
        transId: string;
        responseCode?: number;
        responseReasonDescription?: string;
        transactionStatus?: string;
        submitTimeUTC?: string;
        authAmount?: number;
        settleAmount?: number;
        subscription?: { id: number | string; payNum?: number };
        profile?: { customerProfileId?: string; customerPaymentProfileId?: string };
      };
    }
  >("getTransactionDetailsRequest", { transId });
  if (isFailure(res) || apiFailure(res)) return null;
  return res.transaction ?? null;
}

// ---------------------------------------------------------------------------
// ARB subscriptions
// ---------------------------------------------------------------------------

/** ARB dates are in Mountain Time. */
export function arbToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export async function createSubscription(input: {
  name: string;
  amountCents: number;
  startDate: string;
  customerProfileId: string;
  paymentProfileId: string;
}): Promise<{ ok: true; subscriptionId: string } | Failure> {
  const res = await call<ApiResponse & { subscriptionId?: string }>("ARBCreateSubscriptionRequest", {
    subscription: {
      name: input.name.slice(0, 50),
      paymentSchedule: {
        interval: { length: "1", unit: "months" },
        startDate: input.startDate,
        totalOccurrences: "9999",
      },
      amount: cents(input.amountCents),
      profile: { customerProfileId: input.customerProfileId, customerPaymentProfileId: input.paymentProfileId },
    },
  });
  if (isFailure(res)) return res;
  const fail = apiFailure(res);
  if (fail) return fail;
  if (!res.subscriptionId) return { ok: false, code: "NO_SUBSCRIPTION", message: "No subscription id returned." };
  return { ok: true, subscriptionId: res.subscriptionId };
}

export async function updateSubscription(input: {
  subscriptionId: string;
  amountCents?: number;
  profile?: { customerProfileId: string; paymentProfileId: string };
}): Promise<{ ok: true } | Failure> {
  const subscription: Record<string, unknown> = {};
  if (input.amountCents !== undefined) subscription.amount = cents(input.amountCents);
  if (input.profile) {
    subscription.profile = { customerProfileId: input.profile.customerProfileId, customerPaymentProfileId: input.profile.paymentProfileId };
  }
  const res = await call<ApiResponse>("ARBUpdateSubscriptionRequest", { subscriptionId: input.subscriptionId, subscription });
  if (isFailure(res)) return res;
  return apiFailure(res) ?? { ok: true };
}

export async function cancelSubscription(subscriptionId: string): Promise<{ ok: true } | Failure> {
  const res = await call<ApiResponse>("ARBCancelSubscriptionRequest", { subscriptionId });
  if (isFailure(res)) return res;
  const fail = apiFailure(res);
  // E00037: already canceled or terminated.
  if (fail && fail.code !== "E00037") return fail;
  return { ok: true };
}

export type ArbTransaction = { transId?: string; response?: string; submitTimeUTC?: string; payNum?: number; attemptNum?: number };

export async function getSubscription(subscriptionId: string) {
  const res = await call<
    ApiResponse & { subscription?: { status?: string; amount?: number; arbTransactions?: ArbTransaction[] | { arbTransaction?: ArbTransaction[] } } }
  >("ARBGetSubscriptionRequest", { subscriptionId, includeTransactions: true });
  if (isFailure(res) || apiFailure(res)) return null;
  const sub = res.subscription;
  if (!sub) return null;
  const tx = Array.isArray(sub.arbTransactions) ? sub.arbTransactions : (sub.arbTransactions?.arbTransaction ?? []);
  return { status: (sub.status ?? "").toLowerCase(), amount: sub.amount ?? null, transactions: tx };
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

/**
 * Verifies `X-ANET-Signature` (HMAC-SHA512 of the raw body with the Signature Key).
 * Accepts the header with or without the "sha512=" prefix and in either case.
 */
export function verifyWebhookSignature(rawBody: string, header: string | null): boolean {
  const key = process.env.AUTHNET_SIGNATURE_KEY;
  if (!key || !header) return false;
  const received = header.replace(/^sha512=/i, "").trim().toUpperCase();
  const expected = createHmac("sha512", key).update(rawBody, "utf8").digest("hex").toUpperCase();
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
