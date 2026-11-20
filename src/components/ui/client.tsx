"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./button";

/** Submit button that shows a spinner while its form's Server Action runs. */
export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  size = "md",
  className,
  name,
  value,
  disabled,
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending || disabled}
      aria-disabled={pending || disabled}
      className={buttonClass(variant, size, className)}
    >
      {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

/** Renders an ISO timestamp in the viewer's local time zone. */
export function LocalTime({ iso, mode = "datetime" }: { iso: string | null | undefined; mode?: "date" | "datetime" }) {
  if (!iso) return <span>Not set</span>;
  const d = new Date(iso);
  const text =
    mode === "date"
      ? d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
      : d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {text}
    </time>
  );
}
