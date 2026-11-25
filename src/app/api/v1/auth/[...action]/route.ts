import {getAuthService} from "@/server/auth/runtime";
import {failure} from "@/server/http/envelope";

export const dynamic = "force-dynamic";

async function auth(request: Request, context: {params: Promise<{action: string[]}>}) {
  try {
    return await getAuthService().handle(request, (await context.params).action.join("/"));
  } catch (error) {
    return failure(error);
  }
}

export const GET = auth;
export const POST = auth;
