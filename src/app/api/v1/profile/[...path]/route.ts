import {profileHttp} from "@/server/profile/http";
async function handler(request: Request, context: {params: Promise<{path: string[]}>}) {
  return profileHttp(request,"profile",(await context.params).path);
}
export const PATCH = handler;
export const DELETE = handler;
