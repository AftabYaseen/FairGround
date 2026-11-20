import { LinkButton } from "@/components/ui/button";
import { Container } from "@/components/ui/misc";

export default function NotFound() {
  return (
    <Container className="py-24 text-center">
      <p className="tabular font-heading text-6xl font-bold text-muted">404</p>
      <h1 className="mt-4 text-3xl">We could not find that page</h1>
      <p className="mt-2 text-muted">The link may be old, or the page may have moved.</p>
      <div className="mt-8 flex justify-center">
        <LinkButton href="/">Back to home</LinkButton>
      </div>
    </Container>
  );
}
