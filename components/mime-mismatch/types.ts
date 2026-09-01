export type FileScope = number | "all";

export interface MimeMismatchQuery {
  file: FileScope;
  showUnverified: boolean;
  expand: string;
}
