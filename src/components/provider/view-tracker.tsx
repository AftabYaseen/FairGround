"use client";

import { useEffect } from "react";
import { markRequestViewed } from "@/app/actions/inbox";

/** Records that the provider opened a request. Runs on mount, so link prefetching never counts as a view. */
export function ViewTracker({ requestId }: { requestId: string }) {
  useEffect(() => {
    void markRequestViewed(requestId);
  }, [requestId]);
  return null;
}
