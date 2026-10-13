import Link from "next/link";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/candidates", label: "Candidates" },
  { href: "/method", label: "Method" },
];

export default function Header() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand">
          <span className="brand-dot" aria-hidden="true" />
          Planet Hunter
        </Link>
        <nav aria-label="Primary">
          <ul className="nav-list">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="nav-link">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
