import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/ui/misc";

export function ProsePage({ title, intro, draft, children }: { title: string; intro?: ReactNode; draft?: boolean; children: ReactNode }) {
  return (
    <>
      <section className="border-b border-line bg-white">
        <Container className="max-w-3xl py-10 sm:py-14">
          {draft ? <Badge tone="warning">Draft, pending legal review</Badge> : null}
          <h1 className="mt-3 text-4xl sm:text-5xl">{title}</h1>
          {intro ? <p className="mt-4 text-lg text-muted">{intro}</p> : null}
        </Container>
      </section>
      <Container className="max-w-3xl py-10 sm:py-14">
        <div className="space-y-6 [&_h2]:mt-10 [&_h2]:text-2xl [&_li]:ml-5 [&_li]:list-disc [&_p]:leading-relaxed [&_ul]:space-y-1">
          {children}
        </div>
      </Container>
    </>
  );
}
