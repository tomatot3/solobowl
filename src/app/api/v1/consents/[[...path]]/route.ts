import {profileHttp} from "@/server/profile/http";
async function handler(request: Request, context: {params: Promise<{path?: string[]}>}) {
  return profileHttp(request,"consents",(await context.params).path ?? []);
}
export const POST = handler;
export const DELETE = handler;
export const GET = handler;
