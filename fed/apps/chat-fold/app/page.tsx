import { ErrorBoundary } from "@/components/simplex/error-boundary";
import { ThemeToggle } from "@/components/simplex/theme-toggle";

export default function Page() {
  return (
    <ErrorBoundary>
      <ThemeToggle />
    </ErrorBoundary>
  );
}
