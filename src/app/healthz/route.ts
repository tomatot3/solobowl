import { getDatabasePool } from "@/server/db/connection";

export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    await getDatabasePool().query("SELECT 1");
    return Response.json({ app: "shiyoushu", status: "ok" }, { headers });
  } catch {
    return Response.json({ app: "shiyoushu", status: "unavailable" }, { status: 503, headers });
  }
}
