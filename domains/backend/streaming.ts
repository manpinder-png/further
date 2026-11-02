import "server-only";
import type { AgentEvent, AgentId } from "../agents/contracts";
import { errorResponse, HttpError, json } from "./http";

export interface ProgressContext {
  signal: AbortSignal;
  onEvent?: (event: AgentEvent) => void;
  activity: (phase: Extract<AgentEvent, {type:"activity"}>["phase"], label: string, agentId?: AgentId) => void;
}
export function wantsProgress(req: Request) {
  return req.headers.get("accept")?.split(",").some(value => value.trim().split(";")[0] === "text/event-stream") ?? false;
}

/** Auth and input validation belong before this call. Only work events and validated
 * public draft fields enter this stream; provider bodies and reasoning never do. */
export async function withProgress<T>(req: Request, agentId: AgentId, run: (context: ProgressContext) => Promise<T>, options: {
  accepted?: string;
  jsonResponse?: (result: T) => Response;
} = {}): Promise<Response> {
  if (req.signal.aborted) throw new HttpError(499, "This request was cancelled.");
  if (!wantsProgress(req)) {
    const result = await run({signal:req.signal,activity:()=>undefined});
    return options.jsonResponse ? options.jsonResponse(result) : json(result);
  }
  const encoder = new TextEncoder(), cancellation = new AbortController();
  const signal = AbortSignal.any([req.signal,cancellation.signal]);
  let sequence = 0, finished = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (value: unknown) => {
        if (finished || signal.aborted) return;
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`)); }
        catch { cancellation.abort(); }
      };
      const event = (value: AgentEvent) => send({...value,sequence:++sequence});
      const activity: ProgressContext["activity"] = (phase,label,owner=agentId) => event({type:"activity",sequence:0,at:new Date().toISOString(),agentId:owner,phase,label});
      const close = () => {
        if (finished) return;
        finished = true;
        if (timer) clearInterval(timer);
        signal.removeEventListener("abort",close);
        try { controller.close(); } catch { /* Reader already disconnected. */ }
      };
      signal.addEventListener("abort",close,{once:true});
      activity("started",options.accepted ?? "Request received.");
      timer = setInterval(() => {
        if (finished || signal.aborted) return;
        try { controller.enqueue(encoder.encode(": keepalive\n\n")); } catch { cancellation.abort(); }
      },10_000);
      void Promise.resolve().then(()=>run({signal,onEvent:event,activity})).then(result=>{
        if (!signal.aborted) send({type:"result",result});
      }).catch(async error=>{
        if (signal.aborted) return;
        const safe = await errorResponse(error).json() as {error?:string;code?:string;retryWithNewKey?:boolean};
        send({type:"error",error:safe.error ?? "That action could not finish. Please try again.",...(safe.code?{code:safe.code}:{}),...(safe.retryWithNewKey===true?{retryWithNewKey:true}:{})});
      }).finally(close);
    },
    cancel() { cancellation.abort(); if(timer)clearInterval(timer); },
  });
  return new Response(stream,{headers:{"content-type":"text/event-stream; charset=utf-8","cache-control":"no-store, no-transform","connection":"keep-alive","x-accel-buffering":"no"}});
}
