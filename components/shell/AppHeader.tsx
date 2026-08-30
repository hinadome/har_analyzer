"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";

export interface AppHeaderBack {
  href: string;
  label: string;
}

export interface AppHeaderProps {
  /** Shallow crumb after the brand, e.g. "Header Diff". */
  crumb?: string;
  /** Optional back link shown before the brand. */
  back?: AppHeaderBack;
  /** Right-side actions before the theme toggle (e.g. Clear all). */
  actions?: ReactNode;
}

function BrandMark({ size = "md" }: { size?: "sm" | "md" }) {
  const cls =
    size === "md"
      ? "w-7 h-7 text-blue-600 dark:text-blue-400"
      : "w-5 h-5 text-blue-600 dark:text-blue-400";
  return (
    <svg
      className={cls}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
      />
    </svg>
  );
}

export function AppHeader({ crumb, back, actions }: AppHeaderProps) {
  return (
    <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur sticky top-0 z-10 transition-colors">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
        {back && (
          <>
            <Link
              href={back.href}
              className="text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors flex items-center gap-1.5 text-sm"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              {back.label}
            </Link>
            <div className="h-5 w-px bg-slate-300 dark:bg-slate-700" />
          </>
        )}

        <Link
          href="/"
          className="flex items-center gap-3 min-w-0 hover:opacity-90 transition-opacity"
        >
          <BrandMark size={back || crumb ? "sm" : "md"} />
          <h1 className="text-xl font-bold tracking-tight">HAR Analyzer</h1>
        </Link>

        {crumb && (
          <span className="text-slate-400 dark:text-slate-600 text-sm truncate">
            / {crumb}
          </span>
        )}

        <div className="ml-auto flex items-center gap-4">
          {actions}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
