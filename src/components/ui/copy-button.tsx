"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { buttonClass, type ButtonVariant } from "./button";

export function CopyButton({ text, label = "Copy", variant = "primary" }: { text: string; label?: string; variant?: ButtonVariant }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Older browsers: fall back to a hidden textarea.
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button type="button" onClick={copy} className={buttonClass(variant, "md")}>
      {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </button>
  );
}
