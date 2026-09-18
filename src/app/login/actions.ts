"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStore } from "@/lib/store";

export type AuthState = {
  error: string | null;
  /** Set when the project requires email confirmation before first sign-in. */
  notice: string | null;
};

/** Only same-origin paths, so a crafted `?next=` cannot bounce users off-site. */
function safeNext(raw: FormDataEntryValue | null): string {
  const value = typeof raw === "string" ? raw : "";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function readCredentials(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "")
      .trim()
      .toLowerCase(),
    password: String(formData.get("password") ?? ""),
  };
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const { email, password } = readCredentials(formData);
  if (!email || !password) {
    return { error: "Enter your email and password.", notice: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return {
      error:
        error.message === "Invalid login credentials"
          ? "That email and password don't match an account."
          : error.message,
      notice: null,
    };
  }

  revalidatePath("/", "layout");
  redirect(safeNext(formData.get("next")));
}

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const { email, password } = readCredentials(formData);
  const displayName = String(formData.get("displayName") ?? "").trim();

  if (!email || !password || !displayName) {
    return {
      error: "Enter your name, email and a password.",
      notice: null,
    };
  }
  if (password.length < 8) {
    return { error: "Use at least 8 characters for your password.", notice: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });

  if (error) {
    return {
      error: error.message.includes("already registered")
        ? "That email already has an account — sign in instead."
        : error.message,
      notice: null,
    };
  }

  // With email confirmation switched on, signUp succeeds but hands back no
  // session; the account only becomes usable after the link is clicked.
  if (!data.session) {
    return {
      error: null,
      notice: `Check ${email} for a confirmation link, then sign in.`,
    };
  }

  revalidatePath("/", "layout");
  redirect(safeNext(formData.get("next")));
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

/**
 * Delete the signed-in account and everything it owns. App Store rule 5.1.1(v):
 * an app that creates accounts must delete them from inside the app.
 */
export async function deleteAccount(): Promise<{ error: string } | undefined> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  try {
    await getStore().deleteAccount(user.id);
    const { error } = await createAdminClient().auth.admin.deleteUser(user.id);
    if (error) throw error;
  } catch (err) {
    console.error("account deletion failed", user.id, err);
    return { error: "Couldn't delete the account. Try again in a minute." };
  }

  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
