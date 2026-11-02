import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { AGENT_CARDS } from "@/domains/agents/contracts";
import { routingFromEnvironment } from "@/domains/agents/openai-provider";
import ArchitectureExplorer from "@/components/architecture/ArchitectureExplorer";

export const dynamic = "force-dynamic";

export default async function ArchitecturePage() {
  const directory = join(process.cwd(), "domains/data/migrations");
  const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
  const migrations = await Promise.all(files.map((file) => readFile(join(directory, file), "utf8")));
  const tables = [...new Set(migrations.flatMap((migration) => [...migration.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)/g)].map((match) => match[1])))];
  let routes: ReturnType<typeof routingFromEnvironment> | null = null;
  try { routes = routingFromEnvironment(process.env); } catch { /* Show invalid public routing without disclosing environment details. */ }
  return <ArchitectureExplorer cards={AGENT_CARDS} tables={tables} routes={routes} />;
}
