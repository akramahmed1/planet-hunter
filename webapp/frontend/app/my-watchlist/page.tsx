import type { Metadata } from "next";
import MyWatchlist from "@/components/watch/MyWatchlist";

export const metadata: Metadata = { title: "My watchlist", robots: { index: false },
  description: "Candidates you watch, and email alerts, for signed-in teachers and students." };

export default function MyWatchlistPage() {
  return (
    <div className="page">
      <p className="eyebrow">Your list</p>
      <h1>My watchlist</h1>
      <p className="lede">The candidate signals you chose to follow. Only you can see this list.</p>
      <MyWatchlist />
    </div>
  );
}
