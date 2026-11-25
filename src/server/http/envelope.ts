import {randomUUID} from "node:crypto";
import {PortUnavailableError} from "../../domain/shared/ports";
const definitions={
 AUTH_REQUIRED:{status:401,message:"请先登录",retryable:false},
 INVALID_CREDENTIALS:{status:401,message:"邮箱或密码不正确，或邮箱尚未验证",retryable:false},
 INVALID_AUTH_TOKEN:{status:422,message:"此链接无效、已使用或已过期",retryable:false},
 MAIL_UNAVAILABLE:{status:503,message:"邮件服务暂不可用，请稍后再试",retryable:true},
 EMAIL_VERIFICATION_REQUIRED:{status:403,message:"请先验证邮箱",retryable:false},
 RESOURCE_NOT_FOUND:{status:404,message:"记录不存在",retryable:false},
 INVALID_INPUT:{status:422,message:"请检查输入内容",retryable:false},
 NEED_MEAL_CONDITION:{status:422,message:"请至少填写一项当餐条件",retryable:false},
 RECIPE_UNAVAILABLE:{status:409,message:"这个菜谱版本暂不可制作，请查看是否已归档或撤回。",retryable:false},
 SAFETY_WITHDRAWN:{status:409,message:"此菜谱版本已安全撤回，请勿继续制作。",retryable:false},
 CONSENT_REQUIRED:{status:422,message:"请先确认这项资料的用途",retryable:false},
 ORIGIN_NOT_ALLOWED:{status:403,message:"请求来源不受允许",retryable:false},
 UNSUPPORTED_MEDIA_TYPE:{status:415,message:"请求需要JSON格式",retryable:false},
 REVISION_CONFLICT:{status:409,message:"记录已更新，请处理冲突",retryable:false},
 DELETED_VALUE_CONFLICT:{status:409,message:"此账户已清除这组资料，请在食养档案中重新填写",retryable:false},
 IDEMPOTENCY_CONFLICT:{status:409,message:"该操作标识已用于其他内容",retryable:false},
 SAFETY_CONFLICT:{status:409,message:"请先确认饮食限制冲突",retryable:false},
 RATE_LIMITED:{status:429,message:"请求较多，请稍后重试",retryable:true},
 NOT_READY:{status:503,message:"服务暂未就绪",retryable:true},
 CALENDAR_UNAVAILABLE:{status:503,message:"节气资料暂不可用，请稍后重试",retryable:true},
 EXPIRED_STATE:{status:422,message:"这条记录已过期，请重新记录今天的文字",retryable:false},
 INTERNAL_ERROR:{status:500,message:"操作暂未完成，请稍后重试",retryable:true},
} as const;
export type ErrorCode=keyof typeof definitions;
export type FieldError={field:string;code:"required"|"invalid"|"unsupported"};
export class ApiError extends Error{
 readonly fieldErrors?:FieldError[];
 constructor(public readonly code:ErrorCode,fields?:readonly FieldError[]){super(definitions[code]?.message??definitions.INTERNAL_ERROR.message);this.name="ApiError";if(fields?.length)this.fieldErrors=fields.map(f=>({field:/^[a-zA-Z][a-zA-Z0-9_.[\]-]{0,79}$/.test(f.field)?f.field:"input",code:["required","invalid","unsupported"].includes(f.code)?f.code:"invalid"}));}
}
export type ApiMeta={requestId:string;serverTime:string;apiVersion:"1"};
export function createMeta(now=new Date()):ApiMeta{return {requestId:randomUUID(),serverTime:now.toISOString(),apiVersion:"1"};}
const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
export function success<T>(data:T,meta=createMeta(),status=200):Response{return Response.json({data,meta},{status,headers});}
export function failure(error:unknown,meta=createMeta()):Response{
 const known=error instanceof PortUnavailableError?new ApiError("NOT_READY"):error instanceof ApiError&&Object.hasOwn(definitions,error.code)?error:new ApiError("INTERNAL_ERROR");const definition=definitions[known.code];
 return Response.json({error:{code:known.code,message:definition.message,retryable:definition.retryable,...(known.fieldErrors?{fieldErrors:known.fieldErrors}:{})},meta},{status:definition.status,headers});
}
export async function handleApi<T>(work:()=>Promise<T>,meta=createMeta()):Promise<Response>{try{return success(await work(),meta);}catch(error){return failure(error,meta);}}
export function parsePagination(params:URLSearchParams):{limit:number;cursor?:string}{
 const raw=params.get("limit");const cursor=params.get("cursor");
 if(params.getAll("limit").length>1||raw!==null&&(!/^\d+$/.test(raw)||Number(raw)<1||Number(raw)>50))throw new ApiError("INVALID_INPUT",[{field:"limit",code:"invalid"}]);
 if(params.getAll("cursor").length>1||cursor!==null&&!/^[A-Za-z0-9_-]{1,2048}$/.test(cursor))throw new ApiError("INVALID_INPUT",[{field:"cursor",code:"invalid"}]);
 return {limit:raw===null?20:Number(raw),...(cursor===null?{}:{cursor})};
}
