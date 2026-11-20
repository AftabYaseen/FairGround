import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "steel" | "ghost" | "danger" | "inverse";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-[6px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-safety text-charcoal hover:bg-safety-hover border border-safety hover:border-safety-hover",
  secondary: "bg-transparent text-charcoal border border-charcoal hover:bg-charcoal hover:text-white",
  steel: "bg-steel text-white border border-steel hover:bg-steel-dark hover:border-steel-dark",
  ghost: "bg-transparent text-charcoal border border-transparent hover:bg-plaster-2",
  danger: "bg-danger text-white border border-danger hover:bg-[#8f1e18]",
  inverse: "bg-transparent text-white border border-white/70 hover:bg-white hover:text-charcoal",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-5 text-[15px]",
  lg: "h-13 px-7 text-base",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

type ButtonProps = ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize };

export function Button({ variant = "primary", size = "md", className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

type LinkButtonProps = Omit<ComponentProps<typeof Link>, "className"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
};

export function LinkButton({ variant = "primary", size = "md", className, ...props }: LinkButtonProps) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
