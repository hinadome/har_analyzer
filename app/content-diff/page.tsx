"use client";

import { useLayoutEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingState } from "@/components/shell/LoadingState";
import { entryDiffRedirectTarget } from "@/utils/entryDiff";

export default function ContentDiffRedirect() {
  const router = useRouter();

  useLayoutEffect(() => {
    router.replace(entryDiffRedirectTarget("content", window.location.search));
  }, [router]);

  return <LoadingState fullScreen message="Opening entry diff…" />;
}
