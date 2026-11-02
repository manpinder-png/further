import { body, handle, json } from "@/domains/backend/http";
import { AccountUpdate, accountError, requireAccount } from "@/domains/backend/auth";
import { getRepository } from "@/domains/data/repository";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function PATCH(req: Request) {
  return handle(req, async () => {
    const account = await requireAccount(req), patch = AccountUpdate.parse(await body(req, 2000));
    try { return json({ account: await (await getRepository()).auth.updateAccount(account.id, patch) }); }
    catch (error) { return accountError(error); }
  });
}
