/** Reachability is separate from citation provenance or factual correctness. */
export interface SourceVerification {
  ok: boolean;
  state: "reachable" | "unavailable" | "unchecked";
  method: "http" | "oembed" | "policy" | "network";
  message: string;
  status?: number;
  title?: string;
  author?: string;
  thumbnail?: string;
}

// A small list of known documentation publishers. Never fetch arbitrary model URLs.
const EXACT_HOSTS = new Set([
  "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be",
  "wikipedia.org", "www.wikipedia.org", "en.wikipedia.org",
  "arxiv.org", "www.arxiv.org", "khanacademy.org", "www.khanacademy.org",
  "ibm.com", "www.ibm.com", "docs.nvidia.com", "developer.nvidia.com",
  "pytorch.org", "docs.pytorch.org", "www.pytorch.org", "dev.meta.ai",
  "ai.meta.com", "docs.baseten.co", "developer.mozilla.org",
  "docs.python.org", "www.postgresql.org", "postgresql.org",
  "docs.kernel.org", "www.amd.com", "rocm.docs.amd.com",
]);
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]);
const unchecked = (method: SourceVerification["method"], message: string, status?: number): SourceVerification => ({ ok:false,state:"unchecked",method,message,...(status===undefined?{}:{status}) });
export function canCheckSource(url: URL): boolean {
  return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") && EXACT_HOSTS.has(url.hostname);
}

/** Bounded, redirect-safe checks. Unknown does not mean the source is broken. */
export async function verifySourceLink(raw: string, options: { fetch?: typeof fetch; signal?: AbortSignal } = {}): Promise<SourceVerification> {
  let url:URL;
  try { url=new URL(raw); } catch { return unchecked("policy","This link could not be checked."); }
  if (!canCheckSource(url)) return unchecked("policy","This publisher is not in the local link-check list. You can still open the cited source.");
  const fetcher=options.fetch??fetch;
  const signal=AbortSignal.any([AbortSignal.timeout(5000),...(options.signal?[options.signal]:[])]);
  try {
    if (YOUTUBE_HOSTS.has(url.hostname)) {
      const response=await fetcher(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url.toString())}`,{redirect:"error",signal});
      if (!response.ok) {
        await response.body?.cancel();
        return response.status===404||response.status===410 ? {ok:false,state:"unavailable",method:"oembed",message:"This video is not available from the provider.",status:response.status} : unchecked("oembed","The video provider did not allow a link check.",response.status);
      }
      const text=await response.text();
      if (text.length>16_384) return unchecked("oembed","The video provider returned an unexpected response.");
      const value=JSON.parse(text) as Record<string,unknown>;
      return {ok:true,state:"reachable",method:"oembed",message:"The video link was reachable when checked.",...(typeof value.title==="string"?{title:value.title.slice(0,500)}:{}),...(typeof value.author_name==="string"?{author:value.author_name.slice(0,300)}:{}),...(typeof value.thumbnail_url==="string"&&/^https:\/\/i\.ytimg\.com\//.test(value.thumbnail_url)?{thumbnail:value.thumbnail_url}:{})};
    }
    let method:"HEAD"|"GET"="HEAD";
    for (let hop=0;hop<4;hop++) {
      const response=await fetcher(url,{method,redirect:"manual",signal,...(method==="GET"?{headers:{range:"bytes=0-1023"}}:{})});
      // No page contents are interpreted as instructions or retained by this check.
      await response.body?.cancel();
      if ([301,302,303,307,308].includes(response.status)) {
        const location=response.headers.get("location");
        if (!location) return unchecked("http","This publisher returned a redirect without a destination.",response.status);
        const next=new URL(location,url);
        if (!canCheckSource(next)) return unchecked("policy","This link redirects outside the local link-check list.",response.status);
        url=next; continue;
      }
      if (method==="HEAD" && [405,501].includes(response.status)) { method="GET"; continue; }
      if (response.ok) return {ok:true,state:"reachable",method:"http",message:"The link was reachable when checked. This does not verify its claims.",status:response.status};
      if ([404,410].includes(response.status)) return {ok:false,state:"unavailable",method:"http",message:"The publisher reports this page is unavailable.",status:response.status};
      return unchecked("http","The publisher did not allow a conclusive link check. You can try opening the source.",response.status);
    }
    return unchecked("http","This link has too many redirects to check locally.");
  } catch { return unchecked("network","A network check could not finish. The source may still open in your browser."); }
}
