"use client";

import { useEffect, useState } from "react";

/**
 * Hidden form field filled with the open-source FingerprintJS visitor id.
 * If the library fails to load (blockers, old browsers) the field stays empty and the form still works.
 */
export function FingerprintInput({ name = "device_fingerprint" }: { name?: string }) {
  const [value, setValue] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const FingerprintJS = (await import("@fingerprintjs/fingerprintjs")).default;
        // monitoring: false stops the library's install-statistics request to a third party.
        const agent = await FingerprintJS.load({ monitoring: false });
        const result = await agent.get();
        if (!cancelled) setValue(result.visitorId);
      } catch (err) {
        console.warn("[fingerprint] unavailable:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return <input type="hidden" name={name} value={value} readOnly />;
}
