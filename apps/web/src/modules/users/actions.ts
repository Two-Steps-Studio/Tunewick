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
