import type { BadgeTone } from "@/components/ui/badge";
import type { Database } from "@/types/database";

export type RequestStatus = Database["public"]["Enums"]["request_status"];
export type RequestOutcome = Database["public"]["Enums"]["request_outcome"];

export type SubmitResult = {
  ok: boolean;
  code: string;
  request_id?: string;
  provider_id?: string;
  is_overage?: boolean;
  provider_cap_reached?: boolean;
  used?: number;
  cap?: number;
  account_status?: string;
  locked_until?: string;
};

/** Friendly messages for every code returned by submit_request(). */
export const SUBMIT_MESSAGES: Record<string, { title: string; body: string }> = {
  ALREADY_ACTIVE: {
    title: "You already have an active request",
    body: "FairGround allows one active request at a time, so providers are treated fairly. Close your current request before starting a new one.",
  },
  DUPLICATE_JOB: {
    title: "This looks like a job you already sent",
    body: "You sent a very similar request in the last 72 hours. FairGround does not allow the same job to be shopped to several providers. This has been recorded on your account.",
  },
  PROVIDER_PAUSED: {
    title: "This provider is not accepting requests right now",
    body: "They have paused new requests. Please check back later.",
  },
  PROVIDER_AT_CAP: {
    title: "This provider is fully booked this month",
    body: "They have reached their request limit for this month. Please check back later.",
  },
  PROVIDER_NOT_FOUND: {
    title: "We could not find that provider",
    body: "The link may be out of date.",
  },
  NOT_VERIFIED: {
    title: "Please verify your email and phone first",
    body: "Every request on FairGround comes from a verified person.",
  },
  NO_ACK: {
    title: "Please agree to the fairness statement",
    body: "You need to accept it once before sending your first request.",
  },
  RATE_LIMITED: {
    title: "Too many requests",
    body: "You have sent too many requests in the last 24 hours. Please try again tomorrow.",
  },
  ACCOUNT_LOCKED: {
    title: "Your account cannot send requests right now",
    body: "Request submissions are locked on your account.",
  },
  NOT_CLIENT: {
    title: "Only client accounts can send requests",
    body: "Log in with a client account to send a request.",
  },
  INVALID_INPUT: {
    title: "Some details are missing or not valid",
    body: "Please check the form and try again.",
  },
  NOT_AUTHENTICATED: {
    title: "Please log in again",
    body: "Your session has ended.",
  },
};

export const STATUS_LABEL: Record<RequestStatus, string> = {
  active: "Active",
  declined: "Declined by provider",
  completed: "Completed",
  closed_by_provider: "Closed by provider",
  closed_by_client: "Closed by client",
  expired: "Expired",
  closed_by_admin: "Closed by FairGround",
};

export const STATUS_TONE: Record<RequestStatus, BadgeTone> = {
  active: "warning",
  declined: "neutral",
  completed: "success",
  closed_by_provider: "neutral",
  closed_by_client: "neutral",
  expired: "neutral",
  closed_by_admin: "danger",
};

export const OUTCOME_LABEL: Record<RequestOutcome, string> = {
  hired: "Hired",
  not_hired: "Not hired",
  no_response: "No response",
};

export const TIMING_OPTIONS = ["As soon as possible", "Within a week", "Within a month", "Flexible"] as const;
