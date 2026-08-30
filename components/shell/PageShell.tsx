import type { ReactNode } from "react";
import { AppHeader, type AppHeaderProps } from "@/components/shell/AppHeader";

export interface PageShellProps extends AppHeaderProps {
  children: ReactNode;
  /** Extra classes on the main content wrapper. */
  mainClassName?: string;
}

/** Sticky header + max-width main. Pages pass chrome via AppHeader props. */
export function PageShell({
  children,
  mainClassName = "space-y-8",
  ...headerProps
}: PageShellProps) {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <AppHeader {...headerProps} />
      <main className={`max-w-7xl mx-auto px-6 py-8 ${mainClassName}`}>
        {children}
      </main>
    </div>
  );
}
