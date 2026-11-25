import {z} from "zod";
import {consentInput, patchInput, sectionName, stamp} from "../../domain/profile/sections";
import {readConfig} from "../config";
import {getAuthService} from "../auth/runtime";
import {getDatabasePool} from "../db/connection";
import {assertJsonMutation, assertSafeWrite, requireAccountSession} from "../http/access";
import {ApiError, failure, success} from "../http/envelope";
import {createProfileService} from "./service";
import {AI_NOTICE_VERSION} from "../../domain/profile/ai-consent";
import {readAiConsent,setAiConsent} from "./ai-consent";

export async function profileHttp(request: Request, resource: "profile" | "consents", path: string[]) {
  try {
    const config=readConfig();
    const {APP_BASE_URL}=config;
    assertSafeWrite(request, APP_BASE_URL);
    assertJsonMutation(request);
    // A visitor without credentials can use the local profile even if account services are offline.
    if (!request.headers.has("cookie")) throw new ApiError("AUTH_REQUIRED");
    const {id} = await requireAccountSession(request, getAuthService().resolveSession);
    const expectedAccount = request.headers.get("x-profile-account");
    if (expectedAccount !== null && expectedAccount !== id) throw new ApiError("REVISION_CONFLICT");
    const pool=getDatabasePool();
    if(resource==="consents"&&path.length===1&&path[0]==="ai"){
      const notice=config.AI_MODE==="live"?config.AI_NOTICE_URL??null:null;
      if(request.method==="GET")return success(await readAiConsent(pool,id,notice));
      if(request.method==="POST"){
        const text=await request.text();
        if(text.length>1024)throw new ApiError("INVALID_INPUT");
        let input:unknown;
        try{input=JSON.parse(text);}catch{throw new ApiError("INVALID_INPUT");}
        const parsed=z.object({accepted:z.literal(true),noticeVersion:z.literal(AI_NOTICE_VERSION)}).strict().safeParse(input);
        if(!parsed.success)throw new ApiError("INVALID_INPUT");
        return success(await setAiConsent(pool,id,notice,true));
      }
      if(request.method==="DELETE")return success(await setAiConsent(pool,id,notice,false));
      throw new ApiError("RESOURCE_NOT_FOUND");
    }
    const service = createProfileService(pool);
    if (request.method === "GET" && resource === "profile" && !path.length) return success({...await service.read(id),accountId:id});

    const text = await request.text();
    if (text.length > 16384) throw new ApiError("INVALID_INPUT");
    let input: unknown;
    try { input = JSON.parse(text); } catch { throw new ApiError("INVALID_INPUT"); }

    if (resource === "consents") {
      if (request.method === "POST" && !path.length) {
        const {purpose} = consentInput.parse(input);
        return success(await service.grant(id, purpose), undefined, 201);
      }
      if (request.method === "DELETE" && path.length === 1) {
        const {baseRevision} = z.object({baseRevision: z.number().int().min(1)}).strict().parse(input);
        return success(await service.revoke(id, z.uuid().parse(path[0]), baseRevision));
      }
    } else {
      const section = sectionName.parse(path[0]);
      if (request.method === "PATCH" && path.length === 1) return success(await service.save(id,section,patchInput.parse(input)));
      if (request.method === "DELETE" && path.length === 3 && path[1] === "items") {
        return success(await service.remove(id, section, path[2]!, stamp.strict().parse(input)));
      }
    }
    throw new ApiError("RESOURCE_NOT_FOUND");
  } catch (error) {
    return failure(error instanceof z.ZodError ? new ApiError("INVALID_INPUT") : error);
  }
}
