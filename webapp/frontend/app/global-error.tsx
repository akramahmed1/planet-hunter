"use client";

import "./globals.css";

// The last safety net: the page shell itself failed, so this draws its own <html> and uses no shared
// components. Plain links (not next/link) so it works even if the router is the thing that broke.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main className="page" id="main">
          <p className="eyebrow">Something went wrong</p>
          <h1>Planet Hunter could not load</h1>
          <p className="lede">It is on our side, not yours. Try again in a moment.</p>
          <div className="btn-row">
            <button type="button" className="btn btn--primary" onClick={() => reset()}>
              Try again
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="btn">
              Go to the home page
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
