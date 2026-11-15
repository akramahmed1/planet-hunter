/** A placeholder block shown while content loads. Hidden from screen readers. */
export default function Skeleton({
  width = "100%",
  height = "1rem",
  radius,
}: {
  width?: string;
  height?: string;
  radius?: string;
}) {
  return <span className="skeleton" aria-hidden="true" style={{ width, height, borderRadius: radius }} />;
}
