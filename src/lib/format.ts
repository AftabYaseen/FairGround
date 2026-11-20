export function money(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars.toFixed(0)}` : `$${dollars.toFixed(2)}`;
}

/** Formats a date-only value (YYYY-MM-DD) without time zone drift. */
export function formatDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Normalises a US phone number to E.164. Returns null if it cannot be parsed. */
export function toE164(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export function maskPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const last4 = e164.slice(-4);
  return `ending in ${last4}`;
}

export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

export function hoursLabel(hours: number | null | undefined): string {
  if (hours == null) return "Not enough data yet";
  if (hours < 1) return "Under an hour";
  if (hours < 24) return `About ${Math.round(hours)} hour${Math.round(hours) === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `About ${days} day${days === 1 ? "" : "s"}`;
}
