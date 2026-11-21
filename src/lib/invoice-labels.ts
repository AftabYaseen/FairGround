import type { BadgeTone } from "@/components/ui/badge";
import type { Database } from "@/types/database";

type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  pending: "Due",
  paid: "Paid",
  failed: "Failed",
  void: "Void",
};

export const INVOICE_STATUS_TONE: Record<InvoiceStatus, BadgeTone> = {
  pending: "warning",
  paid: "success",
  failed: "danger",
  void: "neutral",
};

export const SUBSCRIPTION_LABEL: Record<string, { label: string; tone: BadgeTone }> = {
  active: { label: "Active", tone: "success" },
  suspended: { label: "Suspended", tone: "danger" },
  canceled: { label: "Canceled", tone: "neutral" },
  terminated: { label: "Ended", tone: "danger" },
  expired: { label: "Expired", tone: "neutral" },
};
