import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/env";
import { LINK_LOCK_COOKIE } from "@/lib/link-lock";
import { homeForRole, type Role } from "@/lib/roles";

const GUARDS: { prefix: string; roles: Role[] }[] = [
  { prefix: "/admin", roles: ["admin"] },
  { prefix: "/dashboard", roles: ["provider"] },
  { prefix: "/my-request", roles: ["client"] },
  { prefix: "/request", roles: ["client"] },
  { prefix: "/account", roles: ["client", "provider", "admin"] },
  { prefix: "/verify-phone", roles: ["client", "provider", "admin"] },
];

function matchGuard(pathname: string) {
  return GUARDS.find((g) => pathname === g.prefix || pathname.startsWith(`${g.prefix}/`));
}

/**
 * Refreshes the Supabase session cookie on every request and applies optimistic
 * role-based redirects. RLS in the database is still the real guard.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return response;
  }

  const supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Do not run code between createServerClient and getClaims().
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub ?? null;

  const { pathname, searchParams } = request.nextUrl;

  // Contractor link lock: arriving through /p/[slug] (not from the directory) locks the visit to that provider.
  const linkMatch = pathname.match(/^\/p\/([a-z0-9-]+)\/?$/);
  if (linkMatch && searchParams.get("from") !== "browse") {
    response.cookies.set(LINK_LOCK_COOKIE, linkMatch[1], {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  const guard = matchGuard(pathname);
  if (!guard) return response;

  const redirectTo = (path: string, keepNext = false) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    if (keepNext) url.searchParams.set("next", pathname + request.nextUrl.search);
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  };

  if (!userId) {
    return redirectTo("/login", true);
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = profile?.role;
  if (!role || !guard.roles.includes(role)) {
    return redirectTo(homeForRole(role));
  }

  return response;
}
