export type FileScope = number | "all";

export interface CacheValidatorQuery {
  file: FileScope;
  showNoValidator: boolean;
  expand: string;
}
