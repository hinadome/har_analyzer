"use client";

import { useEffect, useState } from "react";
import type { EntryRecord } from "@/types/har";
import { loadEntryBodyAsync } from "@/utils/storage";

/**
 * Resolve an entry's response body from memory or IndexedDB cold storage.
 */
export function useEntryBody(entry: EntryRecord | null | undefined): {
  body: string | undefined;
  loading: boolean;
  hasBody: boolean;
} {
  const hasBody = entry?.hasResponseBody === true || entry?.responseContent !== undefined;
  const [body, setBody] = useState<string | undefined>(
    () => entry?.responseContent,
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!entry) {
      setBody(undefined);
      setLoading(false);
      return;
    }
    if (entry.responseContent !== undefined) {
      setBody(entry.responseContent);
      setLoading(false);
      return;
    }
    if (entry.hasResponseBody !== true || !entry.bodyId) {
      setBody(undefined);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    loadEntryBodyAsync(entry.bodyId).then((text) => {
      if (cancelled) return;
      setBody(text);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [entry, entry?.bodyId, entry?.responseContent, entry?.hasResponseBody]);

  return { body, loading, hasBody };
}
