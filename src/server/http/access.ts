import type {AccountId,Owner} from "../../domain/shared/types";
import {accountId} from "../../domain/shared/validation";
import {ApiError,handleApi,createMeta} from "./envelope";
import {systemClock,type Clock} from "../../domain/calendar/clock";
import {hasAccountCredentials} from "../auth/account-access";
export type TrustedSession={accountId:AccountId;emailVerified:boolean;username?:string|null;expiresAt:Date};
export type SessionResolver=(request:Request)=>Promise<TrustedSession|null>;
export type AccountContext={kind:"account";id:AccountId};
export async function requireAccountSession(request:Request,resolveSession:SessionResolver,now=new Date()):Promise<AccountContext>{
 const session=await resolveSession(request);
 if(!session||!Number.isFinite(session.expiresAt.getTime())||session.expiresAt.getTime()<=now.getTime())throw new ApiError("AUTH_REQUIRED");
 if(!hasAccountCredentials(session))throw new ApiError("EMAIL_VERIFICATION_REQUIRED");
 try{return {kind:"account",id:accountId(session.accountId)};}catch{throw new ApiError("AUTH_REQUIRED");}
}
export function assertResourceOwner(context:AccountContext,resourceOwner:Owner|null):void{
 if(!resourceOwner||resourceOwner.kind!=="account"||resourceOwner.id!==context.id)throw new ApiError("RESOURCE_NOT_FOUND");
}
export function assertSafeWrite(request:Request,expectedBaseUrl:string):void{
 if(["GET","HEAD","OPTIONS"].includes(request.method.toUpperCase()))return;
 const header=request.headers.get("origin");let origin:string;
 try{if(!header||header==="null")throw new Error();origin=new URL(header).origin;}catch{throw new ApiError("ORIGIN_NOT_ALLOWED");}
 if(origin!==new URL(expectedBaseUrl).origin||request.headers.get("sec-fetch-site")==="cross-site")throw new ApiError("ORIGIN_NOT_ALLOWED");
}
export function assertJsonMutation(request:Request):void{
 if(!["POST","PUT","PATCH"].includes(request.method.toUpperCase()))return;
 if(request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase()!=="application/json")throw new ApiError("UNSUPPORTED_MEDIA_TYPE");
}
/** Shared boundary, not an authentication implementation. The production session
 * resolver will be supplied by Better Auth; tests use clearly marked doubles. */
export function createAccountHandler<T>(dependencies:{baseUrl:string;resolveSession:SessionResolver;clock?:Clock},work:(context:AccountContext,request:Request)=>Promise<T>){
 return async(request:Request):Promise<Response>=>{
  const instant=(dependencies.clock??systemClock).now();
  return handleApi(async()=>{
   assertSafeWrite(request,dependencies.baseUrl);assertJsonMutation(request);
   const context=await requireAccountSession(request,dependencies.resolveSession,instant);
   return work(context,request);
  },createMeta(instant));
 };
}
