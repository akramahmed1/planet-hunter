import type { ReactNode } from "react";

/** A surface for grouped content. Pass `title` to give it a heading. */
export default function Card({
  title,
  eyebrow,
  tone = "default",
  as: Tag = "div",
  headingLevel = 2,
  className,
  children,
  ...aria
}: {
  title?: ReactNode;
  eyebrow?: string;
  tone?: "default" | "glow" | "flat";
  as?: "div" | "section" | "article";
  headingLevel?: 2 | 3;
  className?: string;
  children: ReactNode;
  "aria-labelledby"?: string;
}) {
  const H = headingLevel === 2 ? "h2" : "h3";
  const cls = ["card", tone !== "default" && `card--${tone}`, className].filter(Boolean).join(" ");
  return (
    <Tag className={cls} {...aria}>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      {title && <H className="card-title">{title}</H>}
      {children}
    </Tag>
  );
}
