"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

function Yes({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="button button--primary" disabled={pending} aria-busy={pending}>
      {label}
    </button>
  );
}

/** For actions that cannot be undone: the first click asks, the second one acts. */
export function ConfirmAction({
  action,
  label,
  question,
  yes,
  no,
}: {
  action: () => Promise<void>;
  label: string;
  question: string;
  yes: string;
  no: string;
}) {
  const [confirming, setConfirming] = useState(false);
  return confirming ? (
    <form action={action} className="playlist-delete__confirm">
      <p role="alert" className="field__error">
        {question}
      </p>
      <Yes label={yes} />
      <button type="button" className="button" onClick={() => setConfirming(false)}>
        {no}
      </button>
    </form>
  ) : (
    <button type="button" className="button" onClick={() => setConfirming(true)}>
      {label}
    </button>
  );
}
