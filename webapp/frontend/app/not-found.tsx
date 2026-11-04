import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Page not found",
  description: "That page does not exist. Here are some places to start.",
};

// Shown for every unknown address and every notFound() call, inside the normal site shell.
export default function NotFound() {
  return (
    <div className="page">
      <p className="eyebrow">Error 404</p>
      <h1>We could not find that page</h1>
      <p className="lede">
        The address may have a typo, or the page may have moved. Nothing here is broken on your side.
      </p>
      <div className="btn-row">
        <ButtonLink href="/" variant="primary">
          Go to the home page
        </ButtonLink>
        <ButtonLink href="/candidates">See the candidates</ButtonLink>
        <ButtonLink href="/solar-system" variant="ghost">
          Explore the Solar System
        </ButtonLink>
      </div>
    </div>
  );
}
