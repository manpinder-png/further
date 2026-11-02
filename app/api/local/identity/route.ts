import { z } from "zod";
import { body,handle,json } from "@/domains/backend/http";
import { identity } from "@/domains/backend/identity";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function GET(req:Request) { return handle(req,async()=>{ const r=await identity(req); return json(r.value,200,{"set-cookie":r.cookie}); }); }
export async function POST(req:Request) { return handle(req,async()=>{ const action=z.object({userId:z.string().uuid().optional(),displayName:z.string().trim().min(1).max(40).optional()}).refine(v=>Boolean(v.userId)!==Boolean(v.displayName),"Supply a name or an existing local profile.").parse(await body(req));const r=await identity(req,action);return json(r.value,200,{"set-cookie":r.cookie}); }); }
