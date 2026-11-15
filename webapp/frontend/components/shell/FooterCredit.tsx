"use client";

import { usePathname } from "next/navigation";
import { creditFor } from "@/lib/credit";

/** The first line of the footer: where this page's data comes from. */
export default function FooterCredit() {
  return <p data-testid="footer-credit">{creditFor(usePathname() ?? "/")}</p>;
}
