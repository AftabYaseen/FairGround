"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/misc";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Container className="py-24 text-center">
      <h1 className="text-3xl">Something went wrong</h1>
      <p className="mt-2 text-muted">Please try again. If it keeps happening, contact us and we will look into it.</p>
      <div className="mt-8 flex justify-center">
        <Button onClick={() => reset()}>Try again</Button>
      </div>
    </Container>
  );
}
