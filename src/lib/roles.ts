import type { Database } from "@/types/database";

export type Role = Database["public"]["Enums"]["user_role"];

export function homeForRole(role: Role | null | undefined): string {
  if (role === "admin") return "/admin";
  if (role === "provider") return "/dashboard";
  return "/my-request";
}

/** Only allow relative in-app paths as redirect targets. */
export function safeNext(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
