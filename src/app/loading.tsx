import { Container } from "@/components/ui/misc";

export default function Loading() {
  return (
    <Container className="py-16" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="h-9 w-64 animate-pulse rounded-[6px] bg-plaster-2" />
      <div className="mt-4 h-5 w-96 max-w-full animate-pulse rounded-[6px] bg-plaster-2" />
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-[10px] border border-line bg-white" />
        ))}
      </div>
    </Container>
  );
}
