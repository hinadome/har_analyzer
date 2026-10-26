import type { ContentSearchMode } from "@/utils/contentSearch";

export type FileScope = "all" | number;

export interface PageQuery {
  text: string;
  url: string;
  mode: ContentSearchMode;
  caseSensitive: boolean;
  /** When true, search the base64-decoded form of bodies that look like base64. */
  decode: boolean;
  file: FileScope;
  expand: string;
}
