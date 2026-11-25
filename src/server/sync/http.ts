import {z} from "zod";
import {readConfig} from "../config";
import {getAuthService} from "../auth/runtime";
import {getDatabasePool} from "../db/connection";
import {assertJsonMutation, assertSafeWrite, requireAccountSession} from "../http/access";
import {ApiError, failure} from "../http/envelope";

export async function accountRequest(request: Request, work: (context: {
  id: Awaited<ReturnType<typeof requireAccountSession>>["id"];
  secret: string;
  pool: ReturnType<typeof getDatabasePool>;
  readBody: () => Promise<unknown>;
}) => Promise<Response>) {
  try {
    const config=readConfig();
    assertSafeWrite(request,config.APP_BASE_URL);
    assertJsonMutation(request);
    if (!request.headers.has("cookie")) throw new ApiError("AUTH_REQUIRED");
    const {id}=await requireAccountSession(request,getAuthService().resolveSession);
    const expected=request.headers.get("x-profile-account");
    if (expected!==null && expected!==id) throw new ApiError("REVISION_CONFLICT");
    if (!config.AUTH_SECRET) throw new ApiError("NOT_READY");
    return await work({id,secret:config.AUTH_SECRET,pool:getDatabasePool(),async readBody(){
      const raw=await request.text();
      if (raw.length>65536) throw new ApiError("INVALID_INPUT");
      try {return JSON.parse(raw);} catch {throw new ApiError("INVALID_INPUT");}
    }});
  } catch (error) {
    return failure(error instanceof z.ZodError?new ApiError("INVALID_INPUT"):error);
  }
}
