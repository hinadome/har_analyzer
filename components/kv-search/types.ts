import type { KvLocation, KvSearchMode } from "@/utils/kvSearch";

export type FileScope = "all" | number;

export interface PageQuery {
  name: string;
  value: string;
  url: string;
  scope: Set<KvLocation>;
  mode: KvSearchMode;
  caseSensitive: boolean;
  file: FileScope;
  expand: string;
}
