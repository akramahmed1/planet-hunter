import ErrorState from "@/components/ui/ErrorState";

// Shown whenever the backend cannot be reached or returns an error.
// The site never falls back to hardcoded copies of the data.
export default function ApiError({ what, error }: { what: string; error: string }) {
  return (
    <ErrorState title={`${what} could not be loaded.`} detail={error}>
      <p>
        The results service is unavailable right now, so nothing is shown
        rather than showing stale numbers. Please try again shortly.
      </p>
    </ErrorState>
  );
}
