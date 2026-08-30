import type { CorsSeverity } from "@/utils/corsAnalysis";

export type FileScope = "all" | number;
export type SeverityFilter = "all" | CorsSeverity;

export interface CorsQuery {
  file: FileScope;
  severity: SeverityFilter;
  origin: string;
  expand: string;
}
