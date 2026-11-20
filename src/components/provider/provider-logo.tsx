import Image from "next/image";
import { cn } from "@/lib/cn";

export function ProviderLogo({ name, url, size = 64, className }: { name: string; url: string | null; size?: number; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <div
      className={cn("relative shrink-0 overflow-hidden rounded-[10px] border border-line bg-white", className)}
      style={{ width: size, height: size }}
    >
      {url ? (
        <Image src={url} alt={`${name} logo`} fill sizes={`${size}px`} className="object-contain p-1" />
      ) : (
        <div aria-hidden className="flex size-full items-center justify-center bg-charcoal font-heading font-bold text-safety" style={{ fontSize: size / 2.6 }}>
          {initials || "FG"}
        </div>
      )}
    </div>
  );
}
