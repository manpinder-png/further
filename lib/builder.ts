/**
 * Builder view: infra status, agent log, scoring math, sample-data badges, Ops and the
 * MCP console. Off by default. Set NEXT_PUBLIC_BUILDER_VIEW=true in .env.local to see it.
 * Inlined at build time, so builder-only code is dead in a learner build.
 */
export const BUILDER_VIEW = process.env.NEXT_PUBLIC_BUILDER_VIEW === "true";
