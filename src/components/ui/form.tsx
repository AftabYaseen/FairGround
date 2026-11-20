import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-[6px] border border-line bg-white px-3 text-[15px] text-charcoal placeholder:text-muted/80 transition-colors hover:border-muted focus-visible:border-charcoal disabled:bg-plaster-2 disabled:text-muted aria-[invalid=true]:border-danger";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-32 py-2.5 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(control, "h-11 pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("block text-sm font-semibold text-charcoal", className)} {...props} />;
}

type FieldProps = {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | string[];
  optional?: boolean;
  children: ReactNode;
  className?: string;
};

/** Label + control + hint + error, wired for accessibility. */
export function Field({ label, htmlFor, hint, error, optional, children, className }: FieldProps) {
  const message = Array.isArray(error) ? error[0] : error;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {optional ? <span className="ml-1 font-normal text-muted">(optional)</span> : null}
      </Label>
      {children}
      {hint && !message ? (
        <p id={`${htmlFor}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {message ? (
        <p id={`${htmlFor}-error`} className="text-sm font-medium text-danger" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}

export function Checkbox({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      type="checkbox"
      className={cn("mt-1 size-5 shrink-0 rounded-[4px] border-line accent-[var(--charcoal)]", className)}
      {...props}
    />
  );
}
