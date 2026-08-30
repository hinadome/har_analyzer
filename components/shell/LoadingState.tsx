export interface LoadingStateProps {
  message?: string;
  /** Full-viewport centered (route Suspense / store load). */
  fullScreen?: boolean;
}

export function LoadingState({
  message = "Loading…",
  fullScreen = false,
}: LoadingStateProps) {
  const body = (
    <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
      <div
        className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"
        aria-hidden
      />
      <span>{message}</span>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center">
        {body}
      </div>
    );
  }

  return body;
}
