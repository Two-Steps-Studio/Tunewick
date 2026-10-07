"use server";

import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  profileErrorField,
  type SettingsField,
  type SettingsFormState,
  settingsSchema,
} from "./validation";

const FIELDS: readonly SettingsField[] = ["handle", "displayName", "bio"];

export async function updateSettings(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const values = Object.fromEntries(
    ["handle", "displayName", "bio", "locale", "activityVisibility"].map((n) => [
      n,
      String(formData.get(n) ?? ""),
    ]),
  );
  const parsed = settingsSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: SettingsFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as SettingsField;
      if (FIELDS.includes(field) && !fieldErrors[field]) {
        fieldErrors[field] = issue.message as NonNullable<SettingsFormState["error"]>;
      }
    }
    return Object.keys(fieldErrors).length
      ? { fieldErrors, values }
      : { error: "unexpected", values };
  }

  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "unexpected" };

  const input = parsed.data;
  const profile = await supabase
    .from("profiles")
    .update({ handle: input.handle, display_name: input.displayName, bio: input.bio })
    .eq("id", auth.user.id);
  if (profile.error) {
    const fieldErrors = profileErrorField(profile.error);
    return fieldErrors ? { fieldErrors, values } : { error: "unexpected", values };
  }

  const settings = await supabase
    .from("profile_settings")
    .update({ locale: input.locale, activity_visibility: input.activityVisibility })
    .eq("user_id", auth.user.id);
  if (settings.error) return { error: "unexpected", values };

  // A new language preference also switches the interface right away.
  if (input.locale !== (await getLocale())) {
    (await cookies()).set("NEXT_LOCALE", input.locale, { path: "/", sameSite: "lax" });
    redirect({ href: "/settings", locale: input.locale });
  }
  return { saved: true };
}

export interface DeleteAccountState {
  error?: "email_mismatch" | "sole_owner" | "staff" | "failed";
  email?: string;
}

/** Deletes the signed-in account (GDPR art. 17); the database checks everything again. */
export async function deleteAccount(
  _prev: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const email = String(formData.get("email") ?? "").trim();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_my_account", { confirm_email: email });
  if (error) {
    const hint = error.hint as DeleteAccountState["error"];
    return {
      error:
        hint === "email_mismatch" || hint === "sole_owner" || hint === "staff" ? hint : "failed",
      email,
    };
  }
  // The user no longer exists: drop the session cookies too.
  await supabase.auth.signOut({ scope: "local" });
  return redirect({
    href: { pathname: "/", query: { konto: "usuniete" } },
    locale: await getLocale(),
  });
}
