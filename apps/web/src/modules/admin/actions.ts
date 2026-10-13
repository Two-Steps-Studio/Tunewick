"use server";

import { refresh } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AdminFormState {
  error?: "notFound" | "invalid" | "mfa_required" | "not_allowed" | "already_lifetime" | "failed";
  done?: boolean;
  values?: Record<string, string>;
  /** Shown next to the field it is about (keys: Admin.fieldErrors.*). */
  fieldErrors?: Partial<Record<"handle" | "days" | "note", FieldError>>;
}

type FieldError = "handleRequired" | "handleNotFound" | "daysInvalid" | "noteShort";

/** A profile-handle lookup that failed: "no such account" belongs next to the handle field. */
function userError(error: AdminFormState["error"], values: Record<string, string>): AdminFormState {
  return error === "notFound"
    ? { fieldErrors: { handle: "handleNotFound" }, values }
    : { error, values };
}

function adminError(error: { code?: string; hint?: string }): AdminFormState["error"] {
  if (error.hint === "mfa_required") return "mfa_required";
  if (error.hint === "already_lifetime") return "already_lifetime";
  if (error.code === "42501") return "not_allowed";
  if (error.code === "22023") return "invalid";
  if (error.code === "P0002") return "notFound";
  return "failed";
}

async function findUser(handle: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_find_user", { handle });
  if (error) return { error: adminError(error) };
  return data ? { id: data } : { error: "notFound" as const };
}

export async function grantStaffRole(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const values = {
    handle: String(formData.get("handle") ?? "").trim(),
    role: String(formData.get("role") ?? ""),
  };
  if (!values.handle) return { fieldErrors: { handle: "handleRequired" }, values };
  if (!["moderator", "admin"].includes(values.role)) return { error: "invalid", values };
  const user = await findUser(values.handle);
  if ("error" in user) return userError(user.error, values);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_grant_role", {
    target_user: user.id,
    role: values.role as "moderator" | "admin",
  });
  if (error) return { error: adminError(error), values };
  refresh();
  return { done: true };
}

export async function revokeStaffRole(userId: string, role: "moderator" | "admin") {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_revoke_role", { target_user: userId, role });
  if (error) throw error;
  refresh();
}

export async function setFeatureFlag(flag: string, enabled: boolean) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_set_feature_flag", { flag, enabled });
  if (error) throw error;
  refresh();
}

/** Premium for support cases: by profile handle, N days or for life, with a note (audited). */
export async function grantPremium(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const values = {
    handle: String(formData.get("handle") ?? "").trim(),
    days: String(formData.get("days") ?? "").trim(),
    note: String(formData.get("note") ?? "").trim(),
  };
  const days = values.days === "" ? null : Number(values.days);
  const fieldErrors: AdminFormState["fieldErrors"] = {};
  if (!values.handle) fieldErrors.handle = "handleRequired";
  if (days !== null && !(Number.isInteger(days) && days >= 1 && days <= 3660)) {
    fieldErrors.days = "daysInvalid";
  }
  if (values.note.length < 3) fieldErrors.note = "noteShort";
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };
  const user = await findUser(values.handle);
  if ("error" in user) return userError(user.error, values);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_grant_entitlement", {
    target_user: user.id,
    plan: "premium",
    days: days as number,
    note: values.note,
  });
  if (error) return { error: adminError(error), values };
  refresh();
  return { done: true };
}
