import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { AGENT_CARDS } from "@/domains/agents/contracts";
import { routingFromEnvironment } from "@/domains/agents/openai-provider";
import ArchitectureExplorer from "@/components/architecture/ArchitectureExplorer";

export const dynamic = "force-dynamic";

export default async function ArchitecturePage() {
  const migration = await readFile(join(process.cwd(), "domains/data/migrations/001_local.sql"), "utf8");
  const tables = [...migration.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)/g)].map((match) => match[1]);
  let routes: ReturnType<typeof routingFromEnvironment> | null = null;
  try { routes = routingFromEnvironment(process.env); } catch { /* Show invalid public routing without disclosing environment details. */ }
  return <ArchitectureExplorer cards={AGENT_CARDS} tables={tables} routes={routes} />;
}
