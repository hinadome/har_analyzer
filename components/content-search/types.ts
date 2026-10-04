import type { ContentSearchMode } from "@/utils/contentSearch";

export type FileScope = "all" | number;

export interface PageQuery {
  text: string;
  url: string;
  mode: ContentSearchMode;
  caseSensitive: boolean;
  file: FileScope;
  expand: string;
}
