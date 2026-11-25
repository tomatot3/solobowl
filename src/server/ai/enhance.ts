import {z} from "zod";

export type Factor="season_term"|"winter_recipe"|"within_time_limit";
export type AiCandidate={recipeId:string;versionId:string;role:"primary"|"alternative";factors:readonly Factor[]};
export type ProviderReply={text:string;finishReason:string|null};
export type Provider=(input:{candidates:readonly AiCandidate[];term:string;repair:boolean},signal:AbortSignal)=>Promise<ProviderReply>;
export class ProviderError extends Error{
  constructor(readonly status:number,readonly retryAfterMs?:number){super("MODEL_PROVIDER_ERROR");}
}
type Result={status:"succeeded"|"fallback";code?:string;calls:number;factors?:ReadonlyMap<string,readonly Factor[]>};
const output=z.object({items:z.array(z.object({
  recipeId:z.string(),versionId:z.string(),role:z.enum(["primary","alternative"]),
  reasonFactors:z.array(z.enum(["season_term","winter_recipe","within_time_limit"])).min(1).max(3),
}).strict()).max(3)}).strict();

export function validateReasonReply(reply:ProviderReply,candidates:readonly AiCandidate[]){
  if(reply.finishReason==="length"||!reply.text.trim()||reply.text.length>12000)return null;
  let value:unknown;
  try{value=JSON.parse(reply.text);}catch{return null;}
  const result=output.safeParse(value);
  if(!result.success||result.data.items.length!==candidates.length)return null;
  const byId=new Map(candidates.map(item=>[item.versionId,item]));
  const factors=new Map<string,readonly Factor[]>();
  for(const item of result.data.items){
    const declared=byId.get(item.versionId);
    if(!declared||declared.recipeId!==item.recipeId||declared.role!==item.role||factors.has(item.versionId)
      ||new Set(item.reasonFactors).size!==item.reasonFactors.length||item.reasonFactors.some(factor=>!declared.factors.includes(factor)))return null;
    factors.set(item.versionId,item.reasonFactors);
  }
  // Keep the deterministic rule order for both alternatives.
  return factors;
}

function retryable(error:unknown){
  return !(error instanceof ProviderError)||[429,500,502,503,504].includes(error.status);
}
async function timedCall(provider:Provider,input:Parameters<Provider>[0],ms:number,caller?:AbortSignal){
  const controller=new AbortController();
  const abort=()=>controller.abort();
  const timer=setTimeout(abort,ms);
  caller?.addEventListener("abort",abort,{once:true});
  try{
    if(caller?.aborted)controller.abort();
    return await new Promise<ProviderReply>((resolve,reject)=>{
      const stop=()=>reject(new ProviderError(408));
      if(controller.signal.aborted){stop();return;}
      controller.signal.addEventListener("abort",stop,{once:true});
      Promise.resolve().then(()=>provider(input,controller.signal)).then(resolve,reject);
    });
  }finally{
    clearTimeout(timer);
    caller?.removeEventListener("abort",abort);
  }
}

function wait(ms:number,signal?:AbortSignal){
  return new Promise<void>((resolve,reject)=>{
    if(signal?.aborted){reject(new ProviderError(408));return;}
    function done(){signal?.removeEventListener("abort",abort);resolve();}
    function abort(){clearTimeout(timer);signal?.removeEventListener("abort",abort);reject(new ProviderError(408));}
    const timer=setTimeout(done,ms);
    signal?.addEventListener("abort",abort,{once:true});
  });
}

export async function enhanceReasons(provider:Provider,candidates:readonly AiCandidate[],term:string,signal?:AbortSignal):Promise<Result>{
  const deadline=performance.now()+11000;
  let calls=0;
  let retried=false;
  let repair=false;
  let lastCode="provider_error";
  while(calls<3&&!signal?.aborted){
    const remaining=deadline-performance.now();
    if(remaining<=0)break;
    calls++;
    try{
      const reply=await timedCall(provider,{candidates,term,repair},Math.min(5000,remaining),signal);
      if(performance.now()>=deadline||signal?.aborted)break;
      const factors=validateReasonReply(reply,candidates);
      if(factors)return {status:"succeeded",calls,factors};
      lastCode="invalid_output";
      if(repair)break;
      repair=true;
    }catch(error){
      if(signal?.aborted||performance.now()>=deadline)break;
      lastCode=error instanceof ProviderError&&error.status===429?"rate_limited":error instanceof ProviderError&&error.status===408?"deadline":"provider_error";
      if(retried||calls>=3||(!retryable(error)&&!(error instanceof ProviderError&&error.status===408)))return {status:"fallback",calls,code:lastCode};
      const delay=error instanceof ProviderError?error.retryAfterMs??1000:1000;
      if(delay>=deadline-performance.now())return {status:"fallback",calls,code:lastCode};
      retried=true;
      try{await wait(delay,signal);}catch{break;}
    }
  }
  return {status:"fallback",calls,code:signal?.aborted||performance.now()>=deadline?"deadline":lastCode};
}

export const templates:Record<Factor,string>={
  season_term:"匹配当前节气",winter_recipe:"来自已审核冬季菜谱库",within_time_limit:"在本餐时间上限内",
};
