import Link from "next/link";
import { notFound } from "next/navigation";
import { BUILDER_VIEW } from "@/lib/builder";

// Builder-only route. 404 for learners (NEXT_PUBLIC_BUILDER_VIEW unset or false).
export default function Page() {
  if (!BUILDER_VIEW) notFound();
  return (
    <main className="mx-auto max-w-2xl space-y-5 px-6 py-16">
      <p className="text-sm text-white/50">Builder reference</p>
      <h1 className="text-2xl font-semibold">Historical build planner</h1>
      <p className="text-white/70">
        This planner has been retired. Its original requirements and status labels
        describe planning work, not the current implementation or verified service
        readiness.
      </p>
      <p className="text-white/70">
        Open the current architecture view for agent contracts, model routing and
        the data schema. For source ownership, setup and tested limits, read{" "}
        <code>docs/CODE_MAP.md</code>, <code>docs/HANDOFF.md</code> and{" "}
        <code>docs/VERIFICATION.md</code> in the repository.
      </p>
      <Link className="inline-block text-sky-300 underline underline-offset-4" href="/architecture">
        Open current architecture
      </Link>
    </main>
  );
}
