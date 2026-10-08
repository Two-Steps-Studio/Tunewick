"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  REPORT_REASONS,
  REPORT_SUBJECTS,
  type ReportReason,
  type ReportSubject,
} from "./constants";

export type ReportFormError =
  "details" | "copyright" | "duplicate" | "limit" | "gone" | "signedOut" | "failed";

export interface ReportFormState {
  error?: ReportFormError;
  sent?: boolean;
  values?: Record<string, string>;
}

export async function submitReport(
  subjectType: string,
  subjectId: string,
  _prev: ReportFormState,
  formData: FormData,
): Promise<ReportFormState> {
  const values = Object.fromEntries(
    ["reason", "details", "claimantName", "claimantEmail", "goodFaith"].map((n) => [
      n,
      String(formData.get(n) ?? ""),
    ]),
  );
  const reason = values.reason as ReportReason;
  if (!REPORT_SUBJECTS.includes(subjectType as ReportSubject) || !REPORT_REASONS.includes(reason)) {
    return { error: "failed", values };
  }
  const details = values.details!.trim();
  if (details.length < 10 || details.length > 2000) return { error: "details", values };
  const copyright = reason === "copyright";
  if (
    copyright &&
    (!values.claimantName!.trim() ||
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.claimantEmail!.trim()) ||
      values.goodFaith !== "on")
  ) {
    return { error: "copyright", values };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("submit_report", {
    subject_type: subjectType as ReportSubject,
    subject_id: subjectId,
    reason,
    details,
    claimant_name: copyright ? values.claimantName!.trim() : undefined,
    claimant_email: copyright ? values.claimantEmail!.trim() : undefined,
    good_faith: copyright,
  });
  if (error) {
    const code: Record<string, ReportFormError> = {
      "23505": "duplicate",
      "54000": "limit",
      P0002: "gone",
      "42501": "signedOut",
      "22023": "copyright",
    };
    return { error: code[error.code ?? ""] ?? "failed", values };
  }
  return { sent: true };
}

export interface DecisionFormState {
  error?: "statement" | "mismatch" | "mfa_required" | "not_allowed" | "decided" | "failed";
  values?: Record<string, string>;
}

function decisionError(error: { code?: string; hint?: string }): DecisionFormState["error"] {
  if (error.hint === "mfa_required") return "mfa_required";
  if (error.code === "42501") return "not_allowed";
  if (error.code === "55000") return "decided";
  if (error.code === "22023") return "statement";
  return "failed";
}

/** Moderator decision on a report, with a statement of reasons the owner will read. */
export async function moderateReport(
  reportId: string,
  _prev: DecisionFormState,
  formData: FormData,
): Promise<DecisionFormState> {
  const values = {
    action: String(formData.get("action") ?? ""),
    statement: String(formData.get("statement") ?? "").trim(),
  };
  if (values.statement.length < 20) return { error: "statement", values };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("moderate_report", {
    report: reportId,
    action: values.action,
    statement: values.statement,
  });
  if (error) return { error: decisionError(error), values };
  revalidatePath("/", "layout");
  return {};
}

export async function decideAppeal(
  decisionId: string,
  _prev: DecisionFormState,
  formData: FormData,
): Promise<DecisionFormState> {
  const values = {
    outcome: String(formData.get("outcome") ?? ""),
    note: String(formData.get("note") ?? "").trim(),
  };
  if (values.note.length < 20) return { error: "statement", values };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("decide_appeal", {
    decision: decisionId,
    outcome: values.outcome,
    note: values.note,
  });
  if (error) return { error: decisionError(error), values };
  revalidatePath("/", "layout");
  return {};
}

export interface AppealFormState {
  error?: "text" | "already" | "not_allowed" | "failed";
  values?: { appeal: string };
}

/** The affected owner appeals a decision (once). */
export async function appealDecision(
  decisionId: string,
  _prev: AppealFormState,
  formData: FormData,
): Promise<AppealFormState> {
  const appeal = String(formData.get("appeal") ?? "").trim();
  if (appeal.length < 10 || appeal.length > 4000) return { error: "text", values: { appeal } };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("appeal_moderation_decision", {
    decision: decisionId,
    appeal,
  });
  if (error) {
    const code =
      error.code === "55000" ? "already" : error.code === "42501" ? "not_allowed" : "failed";
    return { error: code, values: { appeal } };
  }
  revalidatePath("/", "layout");
  return {};
}
