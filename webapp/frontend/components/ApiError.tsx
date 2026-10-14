// Shown whenever the backend cannot be reached or returns an error.
// The site never falls back to hardcoded copies of the data.
export default function ApiError({ what, error }: { what: string; error: string }) {
  return (
    <div className="error-box" role="alert">
      <p>
        <strong>{what} could not be loaded.</strong> The results service is
        unavailable right now, so nothing is shown rather than showing stale
        numbers. Please try again shortly.
      </p>
      <p className="muted" style={{ marginBottom: 0 }}>
        Details: {error}
      </p>
    </div>
  );
}
