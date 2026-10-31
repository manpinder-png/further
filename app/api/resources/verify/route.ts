// F3 / anti-slop: confirm a source exists before showing it. YouTube via oEmbed
// (no key, no quota), everything else via HTTP status. Owner: Manpinder.
import { VerifyRequest } from "@/lib/schemas";

export const dynamic = "force-dynamic";
// Host allowlist prevents this route from being used to probe arbitrary URLs (SSRF).
const ALLOWED = /(^|\.)(youtube\.com|youtu\.be|wikipedia\.org|arxiv\.org|khanacademy\.org)$/i;

export async function POST(req: Request) {
  const p = VerifyRequest.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ ok: false, error: "Invalid URL" }, { status: 400 });
  const url = new URL(p.data.url);
  if (url.protocol !== "https:" || !ALLOWED.test(url.hostname)) return Response.json({ ok: false, error: "Host not allowed" }, { status: 400 });
  try {
    if (/youtu/.test(url.hostname)) {
      const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url.toString())}`, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) return Response.json({ ok: false, method: "oembed", status: r.status });
      const d = await r.json();
      return Response.json({ ok: true, method: "oembed", title: d.title, author: d.author_name, thumbnail: d.thumbnail_url });
    }
    const r = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(5000) });
    return Response.json({ ok: r.ok, method: "http", status: r.status });
  } catch {
    return Response.json({ ok: false, method: "network", error: "Unreachable" });
  }
}
