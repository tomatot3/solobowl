import type {EligibilityContext} from "../../domain/recommendations/eligibility";
import {getAuthService} from "../auth/runtime";
import {hasAccountCredentials} from "../auth/account-access";
import {getDatabasePool} from "../db/connection";
import {ApiError} from "../http/envelope";
import {genericContext} from "../recipes/availability";
import type {AccessResolution} from "./service";
import {accountRecommendationContext} from "./account-settings";
export async function resolveAccess(request:Request):Promise<AccessResolution>{
  const credentials=request.headers.has("authorization")||/(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=/.test(request.headers.get("cookie")??"");
  if(!credentials)return {kind:"guest"};
  const session=await getAuthService().resolveSession(request);
  if(!session||!hasAccountCredentials(session))throw new ApiError("AUTH_REQUIRED");
  return {kind:"account",...await accountRecommendationContext(getDatabasePool(),session.accountId)};
}

export async function recipeAccess(request:Request):Promise<EligibilityContext>{
  const access=await resolveAccess(request);
  if(access.kind==="guest")return genericContext;
  if(access.context.safetyConflict)throw new ApiError("SAFETY_CONFLICT");
  return access.context;
}
