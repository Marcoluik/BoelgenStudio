/**
 * POST /api/admin/login  { password }  ->  { token, expiresAt }
 *
 * Bytter admin-kodeordet til et token, der gælder i 12 timer.
 */
import { login } from "../lib/admin-auth";
import { json } from "../lib/clients";

export const config = { path: "/api/admin/login" };

const WRONG_PASSWORD_DELAY_MS = 500;

export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  const result = login(body?.password);
  if (result instanceof Response) return result;

  if (!result) {
    // Gør det langsomt at gætte kodeord
    await new Promise((resolve) => setTimeout(resolve, WRONG_PASSWORD_DELAY_MS));
    return json({ error: "wrong_password" }, 401);
  }
  return json(result);
};
