import {ProviderError,type Provider} from "./enhance";
import {readConfig} from "../config";

export function productionProvider():Provider|undefined{
  const config=readConfig();
  if(config.AI_MODE!=="live"||config.AI_PROCESSING_APPROVED!=="true"||!config.DEEPSEEK_API_KEY||!config.AI_MODEL)return;
  const key=config.DEEPSEEK_API_KEY;
  const model=config.AI_MODEL;
  return async(input,signal)=>{
    const response=await fetch("https://api.deepseek.com/chat/completions",{
      method:"POST",signal,redirect:"error",headers:{authorization:"Bearer "+key,"content-type":"application/json"},
      body:JSON.stringify({model,thinking:{type:"disabled"},temperature:0,max_tokens:400,stream:false,response_format:{type:"json_object"},messages:[
        {role:"system",content:"Return JSON only with items [{recipeId,versionId,role,reasonFactors}]. Keep every candidate and role. Select only nonempty reasonFactors supported for that candidate. Do not add claims or fields."},
        {role:"user",content:JSON.stringify(input)},
      ]}),
    });
    if(!response.ok){
      const header=response.headers.get("retry-after");
      const delay=header&&/^\d+$/.test(header)?Number(header)*1000:header?Date.parse(header)-Date.now():NaN;
      throw new ProviderError(response.status,Number.isFinite(delay)?Math.max(0,delay):undefined);
    }
    const body=await response.json();
    const first=body.choices?.[0];
    return {text:typeof first?.message?.content==="string"?first.message.content:"",finishReason:first?.finish_reason??null};
  };
}
