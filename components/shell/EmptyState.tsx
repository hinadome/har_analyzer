import Link from "next/link";
import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** Defaults to a Home link. */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center py-24 space-y-4 text-center ${className}`}
    >
      <p className="text-slate-600 dark:text-slate-400 text-lg">{title}</p>
      {description && (
        <p className="text-sm text-slate-500 dark:text-slate-500 max-w-md">
          {description}
        </p>
      )}
      {action !== undefined ? (
        action
      ) : (
        <Link
          href="/"
          className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline"
        >
          ← Upload HAR files to get started
        </Link>
      )}
    </div>
  );
}
