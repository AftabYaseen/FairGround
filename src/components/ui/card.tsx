import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-[10px] border border-line bg-white", className)} {...props} />;
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-5 sm:p-6", className)} {...props} />;
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("border-b border-line px-5 py-4 sm:px-6", className)} {...props} />;
}
