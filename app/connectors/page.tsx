import { notFound } from "next/navigation";
import { BUILDER_VIEW } from "@/lib/builder";
import ConnectorConsole from "@/components/builder/ConnectorConsole";

// Builder-only route. 404 for learners (NEXT_PUBLIC_BUILDER_VIEW unset or false).
export default function Page() {
  if (!BUILDER_VIEW) notFound();
  return <ConnectorConsole />;
}
