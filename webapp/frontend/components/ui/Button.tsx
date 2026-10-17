import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "default" | "primary" | "ghost";
type Size = "md" | "sm" | "icon";

function classes(variant: Variant, size: Size, extra?: string) {
  return [
    "btn",
    variant !== "default" && `btn--${variant}`,
    size !== "md" && `btn--${size}`,
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

type CommonProps = { variant?: Variant; size?: Size; className?: string; children: ReactNode };

/** A link styled as a button. Internal hrefs use next/link. */
export function ButtonLink({
  href,
  variant = "default",
  size = "md",
  className,
  children,
  external = false,
}: CommonProps & { href: string; external?: boolean }) {
  if (external) {
    return (
      <a href={href} className={classes(variant, size, className)} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={classes(variant, size, className)}>
      {children}
    </Link>
  );
}

export default function Button({
  variant = "default",
  size = "md",
  className,
  children,
  type = "button",
  ...rest
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={classes(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}
