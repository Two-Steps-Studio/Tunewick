"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { forgetMfaHint } from "../mfa-actions";

type PasskeyError = "unsupported" | "cancelled" | "disabled" | "unexpected";

function passkeyError(error: unknown): PasskeyError {
  const e = error as { name?: string; code?: string; message?: string } | null;
  if (
    e?.code === "mfa_webauthn_enroll_not_enabled" ||
    e?.code === "mfa_webauthn_verify_not_enabled"
  ) {
    return "disabled";
  }
  // The person closed the system dialog or it timed out.
  if (e?.name === "NotAllowedError" || e?.code === "ERROR_CEREMONY_ABORTED") return "cancelled";
  return "unexpected";
}

/** A recognisable name for the device the passkey is made on (no fingerprinting, just a label). */
function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Mac OS X/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return "Tunewick";
}

/**
 * The site the passkey belongs to: this host. A passkey made on one domain only works there, so
 * moving to a new domain means adding passkeys again (the authenticator app keeps working).
 */
function relyingParty() {
  return { rpId: window.location.hostname, rpOrigins: [window.location.origin] };
}

function supported() {
  return typeof window !== "undefined" && "PublicKeyCredential" in window;
}

type Supabase = ReturnType<typeof createSupabaseBrowserClient>;

/**
 * The Supabase browser client (~70 KB) is only needed for a passkey ceremony, so it is loaded
 * when someone presses the button - not shipped with every page that links this module.
 */
async function browserClient(): Promise<Supabase> {
  const { createSupabaseBrowserClient } = await import("@/lib/supabase/browser");
  return createSupabaseBrowserClient();
}
/** The credential types auth-js expects in `mfa.verify` (its WebAuthn Level 3 typings). */
type WebauthnVerify = Extract<
  Parameters<Supabase["auth"]["mfa"]["verify"]>[0],
  { webauthn: unknown }
>["webauthn"];
type RegistrationCredential = Extract<WebauthnVerify, { type: "create" }>["credential_response"];
type AuthenticationCredential = Extract<WebauthnVerify, { type: "request" }>["credential_response"];

/**
 * Registers a passkey: enroll, challenge, let the device make a credential, verify.
 *
 * Written against the plain MFA API rather than auth-js's experimental `mfa.webauthn.register`:
 * that helper defaults to `authenticatorAttachment: "cross-platform"` and security-key hints, so
 * it only offers USB/NFC keys and never the passkey built into the phone or laptop (Face ID,
 * fingerprint, Windows Hello) - exactly what people without an authenticator app have.
 */
async function registerPasskey(supabase: Supabase, friendlyName: string) {
  const { data: factor, error: enrollError } = await supabase.auth.mfa.enroll({
    factorType: "webauthn",
    friendlyName,
  });
  if (enrollError) return enrollError;
  try {
    const { data: challenge, error } = await supabase.auth.mfa.challenge({
      factorId: factor.id,
      webauthn: relyingParty(),
    });
    if (error) throw error;
    if (challenge.type !== "webauthn" || challenge.webauthn.type !== "create") {
      throw new Error("Unexpected WebAuthn challenge");
    }
    const options = challenge.webauthn.credential_options.publicKey;
    // The device shows this name in its passkey list; browsers refuse blank names.
    const user = {
      ...options.user,
      name: options.user.name || friendlyName,
      displayName: options.user.displayName || options.user.name || friendlyName,
    };
    // auth-js types the options with WebAuthn Level 3 ("Future") names the DOM lib lacks.
    const credential = await navigator.credentials.create({
      publicKey: {
        ...options,
        user,
        authenticatorSelection: {
          ...options.authenticatorSelection,
          residentKey: "preferred",
          userVerification: "preferred",
        },
      } as PublicKeyCredentialCreationOptions,
    });
    if (!(credential instanceof PublicKeyCredential)) throw new Error("No credential");
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: factor.id,
      challengeId: challenge.id,
      webauthn: {
        ...relyingParty(),
        type: "create",
        credential_response: credential as RegistrationCredential,
      },
    });
    if (verifyError) throw verifyError;
    return null;
  } catch (error) {
    // Drop the half-made factor so a retry starts clean (it was never verified, so it unlocks nothing).
    await supabase.auth.mfa.unenroll({ factorId: factor.id });
    return error;
  }
}

/** Signs in with a passkey: challenge, let the device sign it, verify (session becomes aal2). */
async function authenticatePasskey(supabase: Supabase, factorId: string) {
  try {
    const { data: challenge, error } = await supabase.auth.mfa.challenge({
      factorId,
      webauthn: relyingParty(),
    });
    if (error) throw error;
    if (challenge.type !== "webauthn" || challenge.webauthn.type !== "request") {
      throw new Error("Unexpected WebAuthn challenge");
    }
    const credential = await navigator.credentials.get({
      publicKey: {
        ...challenge.webauthn.credential_options.publicKey,
        userVerification: "preferred",
      } as PublicKeyCredentialRequestOptions,
    });
    if (!(credential instanceof PublicKeyCredential)) throw new Error("No credential");
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      webauthn: {
        ...relyingParty(),
        type: "request",
        credential_response: credential as AuthenticationCredential,
      },
    });
    if (verifyError) throw verifyError;
    return null;
  } catch (error) {
    return error;
  }
}

/** Adds a passkey: the browser asks for a fingerprint, face or the device PIN. */
export function PasskeyAdd() {
  const t = useTranslations("Security.passkey");
  const router = useRouter();
  const [error, setError] = useState<PasskeyError | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    setError(null);
    if (!supported()) return setError("unsupported");
    startTransition(async () => {
      const supabase = await browserClient();
      // Names must differ per account: the device and the time tell two passkeys apart.
      const friendlyName = `${deviceName()} · ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
      const failed = await registerPasskey(supabase, friendlyName);
      if (failed) return setError(passkeyError(failed));
      await forgetMfaHint();
      router.refresh();
    });
  }

  return (
    <div className="mfa-step">
      {error ? (
        <p role="alert" className="form-error">
          {t(`errors.${error}`)}
        </p>
      ) : null}
      <button
        type="button"
        className="button button--primary"
        disabled={pending}
        aria-busy={pending}
        onClick={add}
      >
        {t("add")}
      </button>
    </div>
  );
}

/** Second sign-in step with a passkey; then continues to `next`. */
export function PasskeyVerify({
  factorId,
  label,
  next,
}: {
  factorId: string;
  /** Which passkey, when the account has more than one (they live on different devices). */
  label?: string;
  next: string;
}) {
  const t = useTranslations("Security.passkey");
  const [error, setError] = useState<PasskeyError | null>(null);
  const [pending, startTransition] = useTransition();

  function verify() {
    setError(null);
    if (!supported()) return setError("unsupported");
    startTransition(async () => {
      const supabase = await browserClient();
      const failed = await authenticatePasskey(supabase, factorId);
      if (failed) return setError(passkeyError(failed));
      await forgetMfaHint();
      // A full load: the server reads the upgraded (aal2) session from the cookies.
      window.location.assign(next);
    });
  }

  return (
    <div className="mfa-step">
      {error ? (
        <p role="alert" className="form-error">
          {t(`errors.${error}`)}
        </p>
      ) : null}
      <button
        type="button"
        className="button button--primary"
        disabled={pending}
        aria-busy={pending}
        onClick={verify}
      >
        {label ? `${t("use")}: ${label}` : t("use")}
      </button>
    </div>
  );
}
