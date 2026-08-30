import type { HarAnalysis, HarFile } from "@/types/har";
import { analyzeHar, parseHarFile } from "@/utils/harParser";
import type {
  HarParseWorkerRequest,
  HarParseWorkerResponse,
} from "@/workers/harParse.worker";

/** Files at or above this size may use the worker when enabled. */
export const HAR_WORKER_SIZE_THRESHOLD = 5 * 1024 * 1024; // 5 MB

/**
 * Feature flag: enable with localStorage `har_parse_worker=1`, or
 * `NEXT_PUBLIC_HAR_PARSE_WORKER=1` at build time.
 */
export function isHarParseWorkerEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage?.getItem("har_parse_worker") === "1") return true;
  } catch {
    /* private mode */
  }
  return process.env.NEXT_PUBLIC_HAR_PARSE_WORKER === "1";
}

export function shouldUseHarParseWorker(file: File): boolean {
  return isHarParseWorkerEnabled() && file.size >= HAR_WORKER_SIZE_THRESHOLD;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

function analyzeInWorker(
  text: string,
  fileName: string,
  fileIndex: number,
): Promise<HarAnalysis> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(
        new URL("../workers/harParse.worker.ts", import.meta.url),
      );
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timeout = window.setTimeout(() => {
      worker.terminate();
      reject(new Error("HAR parse worker timed out"));
    }, 120_000);

    worker.onmessage = (event: MessageEvent<HarParseWorkerResponse>) => {
      if (event.data.id !== id) return;
      window.clearTimeout(timeout);
      worker.terminate();
      if (event.data.ok) resolve(event.data.analysis);
      else reject(new Error(event.data.error));
    };
    worker.onerror = (err) => {
      window.clearTimeout(timeout);
      worker.terminate();
      reject(err.error ?? new Error(err.message || "Worker failed"));
    };

    const msg: HarParseWorkerRequest = { id, fileName, fileIndex, text };
    worker.postMessage(msg);
  });
}

function analyzeOnMainThread(
  text: string,
  fileName: string,
  fileIndex: number,
): HarAnalysis {
  const har = JSON.parse(text) as HarFile;
  if (!har.log || !Array.isArray(har.log.entries)) {
    throw new Error("Invalid HAR file format");
  }
  return analyzeHar(har, fileName, fileIndex);
}

/**
 * Parse + analyze a HAR file. Uses a Web Worker when enabled and the file is
 * large; falls back to the main thread on any worker failure.
 */
export async function parseAndAnalyzeHarFile(
  file: File,
  fileIndex: number,
): Promise<HarAnalysis> {
  if (shouldUseHarParseWorker(file)) {
    const text = await readFileAsText(file);
    try {
      return await analyzeInWorker(text, file.name, fileIndex);
    } catch (err) {
      console.warn(
        "HAR parse worker failed; falling back to main thread:",
        err,
      );
      return analyzeOnMainThread(text, file.name, fileIndex);
    }
  }

  // Small files / worker disabled — existing FileReader path.
  const har = await parseHarFile(file);
  return analyzeHar(har, file.name, fileIndex);
}
