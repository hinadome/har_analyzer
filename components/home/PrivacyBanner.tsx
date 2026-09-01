"use client";

import { useEffect, useState } from "react";
import {
  dismissPrivacyBanner,
  isPrivacyBannerDismissed,
} from "@/utils/privacy";

/** First-visit notice: HARs may hold credentials; data stays in this browser. */
export function PrivacyBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!isPrivacyBannerDismissed());
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-950 dark:text-amber-100/90 flex gap-3 items-start"
    >
      <svg
        className="w-5 h-5 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
        />
      </svg>
      <div className="flex-1 min-w-0 space-y-1">
        <p className="font-medium text-amber-900 dark:text-amber-50">
          HARs can contain credentials
        </p>
        <p className="text-amber-800/90 dark:text-amber-100/80 leading-relaxed">
          Uploaded files stay in this browser&apos;s IndexedDB — nothing is sent
          to a server. Clear all removes local data. Optionally redact
          Authorization, Cookie headers, common token query params, and omit
          response bodies before saving.
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          dismissPrivacyBanner();
          setVisible(false);
        }}
        className="shrink-0 text-amber-800 dark:text-amber-200 hover:text-amber-950 dark:hover:text-amber-50 text-xs font-medium px-2 py-1 rounded border border-amber-300/80 dark:border-amber-800/80 hover:bg-amber-100/80 dark:hover:bg-amber-900/40 transition-colors"
      >
        Got it
      </button>
    </div>
  );
}
