import type { HistogramScale, UrlMatchKey } from "@/utils/perfStats";

export interface DiffQuery {
  base: number;
  cmp: number;
  match: UrlMatchKey;
  scale: HistogramScale;
}
