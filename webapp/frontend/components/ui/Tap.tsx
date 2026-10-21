/**
 * The verb for pressing something: "Tap" where the main pointer is a finger, "Select" with a mouse or trackpad.
 * Both words are in the page and CSS shows one (see `.t-touch` in globals.css), so the server-rendered text
 from the first paint, with no script and no hydration mismatch.
 */
export default function Tap({ lower = false, pointer }: { lower?: boolean; pointer?: string }) {
  return (
    <>
      <span className="t-touch">{lower ? "tap" : "Tap"}</span>
      <span className="t-pointer">{pointer ?? (lower ? "select" : "Select")}</span>
    </>
  );
}
