"use client";

import { useLayoutEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingState } from "@/components/shell/LoadingState";
import { entryDiffRedirectTarget } from "@/utils/entryDiff";

export default function HeaderDiffRedirect() {
  const router = useRouter();

  useLayoutEffect(() => {
    router.replace(entryDiffRedirectTarget("headers", window.location.search));
  }, [router]);

  return <LoadingState fullScreen message="Opening entry diff…" />;
}
