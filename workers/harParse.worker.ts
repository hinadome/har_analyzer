/// <reference lib="webworker" />

/**
 * Web Worker: JSON.parse + analyzeHar off the main thread.
 * Message in:  { id, fileName, fileIndex, text }
 * Message out: { id, ok: true, analysis } | { id, ok: false, error }
 */

import { analyzeHar } from "@/utils/harParser";
import type { HarFile, HarAnalysis } from "@/types/har";

export type HarParseWorkerRequest = {
  id: string;
  fileName: string;
  fileIndex: number;
  text: string;
};

export type HarParseWorkerResponse =
  | { id: string; ok: true; analysis: HarAnalysis }
  | { id: string; ok: false; error: string };

self.onmessage = (event: MessageEvent<HarParseWorkerRequest>) => {
  const { id, fileName, fileIndex, text } = event.data;
  try {
    const har = JSON.parse(text) as HarFile;
    if (!har.log || !Array.isArray(har.log.entries)) {
      const res: HarParseWorkerResponse = {
        id,
        ok: false,
        error: "Invalid HAR file format",
      };
      self.postMessage(res);
      return;
    }
    const analysis = analyzeHar(har, fileName, fileIndex);
    const res: HarParseWorkerResponse = { id, ok: true, analysis };
    self.postMessage(res);
  } catch (err) {
    const res: HarParseWorkerResponse = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(res);
  }
};

export {};
