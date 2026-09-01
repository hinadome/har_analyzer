"use client";

import { useEffect, useState } from "react";
import {
  isRedactSecretsEnabled,
  setRedactSecretsEnabled,
} from "@/utils/privacy";

interface RedactSecretsToggleProps {
  disabled?: boolean;
}

/** Opt-in: mask sensitive headers/cookies/query params before IDB save. */
export function RedactSecretsToggle({ disabled }: RedactSecretsToggleProps) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(isRedactSecretsEnabled());
  }, []);

  return (
    <label
      className={`mt-3 flex items-start gap-2.5 text-sm text-slate-600 dark:text-slate-400 cursor-pointer select-none ${
        disabled ? "opacity-60 cursor-not-allowed" : ""
      }`}
    >
      <input
        type="checkbox"
        className="mt-0.5 rounded border-slate-300 dark:border-slate-600"
        checked={enabled}
        disabled={disabled}
        onChange={(e) => {
          const next = e.target.checked;
          setEnabled(next);
          setRedactSecretsEnabled(next);
        }}
      />
      <span>
        <span className="font-medium text-slate-700 dark:text-slate-300">
          Redact credentials before saving
        </span>
        <span className="block text-xs text-slate-500 dark:text-slate-500 mt-0.5">
          Masks Authorization, Cookie / Set-Cookie, and common token query
          params. Response bodies are not saved to IndexedDB. Off by default so
          CORS and kv-search keep real values.
        </span>
      </span>
    </label>
  );
}
