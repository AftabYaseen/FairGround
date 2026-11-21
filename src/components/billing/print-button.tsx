"use client";

import { Printer } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass("secondary", "sm", "print:hidden")}>
      <Printer aria-hidden className="size-4" /> Print or save as PDF
    </button>
  );
}
