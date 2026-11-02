import { handle,json } from "@/domains/backend/http";
import { requireActor } from "@/domains/backend/identity";
export async function GET(req:Request){return handle(req,async()=>{await requireActor(req);return json({items:[],retired:true});});}
