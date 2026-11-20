import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { postLoginPath } from "@/lib/post-login";
import { safeNext } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/**
 * Handles links from Supabase Auth emails (confirm sign-up, reset password).
 * Supports both the PKCE `code` flow and the `token_hash` flow.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next");
  const isRecovery = type === "recovery" || next === "/reset-password";

  const supabase = await createClient();
  let ok = false;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
    if (error) console.error("[auth/callback] code exchange failed:", error.message);
  } else if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
    if (error) console.error("[auth/callback] otp verify failed:", error.message);
  }

  if (!ok) {
    // A sign-up link opened on another device still confirms the email, so ask them to log in.
    return NextResponse.redirect(new URL(isRecovery ? "/login?notice=link" : "/login?notice=confirmed", origin));
  }

  if (isRecovery) {
    return NextResponse.redirect(new URL("/reset-password", origin));
  }

  const { data: userData } = await supabase.auth.getUser();
  const { data: profile } = userData.user
    ? await supabase.from("profiles").select("role, phone_verified_at").eq("id", userData.user.id).maybeSingle()
    : { data: null };

  return NextResponse.redirect(new URL(safeNext(next, postLoginPath(profile)), origin));
}
