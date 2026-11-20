import type { ReactNode } from "react";
import { Container } from "@/components/ui/misc";

export function AuthShell({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <Container className="flex justify-center py-12 sm:py-16">
      <div className="w-full max-w-md">
        <div className="overflow-hidden rounded-[10px] border border-line bg-white">
          <div className="border-b border-line px-6 py-6 sm:px-8">
            <h1 className="text-3xl">{title}</h1>
            {description ? <p className="mt-2 text-muted">{description}</p> : null}
          </div>
          <div className="px-6 py-6 sm:px-8">{children}</div>
        </div>
        {footer ? <div className="mt-6 text-center text-[15px] text-muted">{footer}</div> : null}
      </div>
    </Container>
  );
}
