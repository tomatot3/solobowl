import {expect,it,vi} from "vitest";
import {enhanceReasons,ProviderError,validateReasonReply,type AiCandidate} from "../../src/server/ai/enhance";
import {productionProvider} from "../../src/server/ai/provider";
import {readConfig} from "../../src/server/config";
const candidates:AiCandidate[]=[
  {recipeId:"r1",versionId:"v1",role:"primary",factors:["season_term"]},
  {recipeId:"r2",versionId:"v2",role:"alternative",factors:["winter_recipe"]},
];
const json=()=>JSON.stringify({items:candidates.map(({factors,...item})=>({...item,reasonFactors:factors}))});
it("uses the OpenAI Responses API and validates its structured reply",async()=>{
  const environment={
    AI_MODE:"live",AI_PROVIDER:"openai",AI_MODEL:"gpt-4.1-mini",
    AI_NOTICE_URL:"https://example.invalid/openai-notice",AI_PROCESSING_APPROVED:"true",
    DEEPSEEK_API_KEY:"other-test-key",
  };
  expect(()=>readConfig(environment)).toThrow("configured server key");
  const provider=productionProvider(readConfig({...environment,OPENAI_API_KEY:"openai-test-key"}))!;
  const fetcher=vi.fn(async (_url:string,_init:RequestInit)=>Response.json({
    status:"completed",
    output:[{type:"message",role:"assistant",content:[{type:"output_text",text:json()}]}],
  }));
  vi.stubGlobal("fetch",fetcher);
  try {
    const result=await enhanceReasons(provider,candidates,"lidong");
    expect(result).toMatchObject({status:"succeeded",calls:1});
    expect(result.factors?.get("v1")).toEqual(["season_term"]);
    const [url,request]=fetcher.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(new Headers(request.headers).get("authorization")).toBe("Bearer openai-test-key");
    expect(JSON.parse(String(request.body))).toMatchObject({
      model:"gpt-4.1-mini",store:false,
      input:JSON.stringify({candidates,term:"lidong",repair:false}),
      text:{format:{type:"json_schema",strict:true,schema:{additionalProperties:false,required:["items"]}}},
    });
  }finally{vi.unstubAllGlobals();}
});
it("rejects replaced primary, extra candidate fields and unsupported reasons",()=>{
  expect(validateReasonReply({text:json(),finishReason:"stop"},candidates)?.size).toBe(2);
  for(const change of [
    (v:ReturnType<typeof JSON.parse>)=>{v.items[0].role="alternative";},
    (v:ReturnType<typeof JSON.parse>)=>{v.items[0].reasonFactors=["within_time_limit"];},
    (v:ReturnType<typeof JSON.parse>)=>{v.items[0].claim="not approved";},
  ]){
    const input=JSON.parse(json());change(input);
    expect(validateReasonReply({text:JSON.stringify(input),finishReason:"stop"},candidates)).toBeNull();
  }
  expect(validateReasonReply({text:json(),finishReason:"length"},candidates)).toBeNull();
});
it("allows one retry and one output repair while keeping three calls total",async()=>{
  vi.useFakeTimers();
  try {
    const fetcher=vi.fn().mockRejectedValueOnce(new ProviderError(429,1500))
      .mockResolvedValueOnce({text:" ",finishReason:"stop"})
      .mockResolvedValueOnce({text:json(),finishReason:"stop"});
    const result=enhanceReasons(fetcher,candidates,"lidong");
    await vi.advanceTimersByTimeAsync(1499);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toMatchObject({status:"succeeded",calls:3});
    expect(fetcher.mock.calls[2]?.[0]).toMatchObject({repair:true});
  }finally{vi.useRealTimers();}
});
it("ignores provider responses after the hard deadline",async()=>{
  vi.useFakeTimers();
  try {
    const signals:AbortSignal[]=[];
    const result=enhanceReasons(async(_,signal)=>{
      signals.push(signal);
      return new Promise(resolve=>setTimeout(()=>resolve({text:json(),finishReason:"stop"}),15000));
    },candidates,"lidong");
    await vi.advanceTimersByTimeAsync(11000);
    expect(await result).toMatchObject({status:"fallback",code:"deadline",calls:2});
    expect(signals.every(signal=>signal.aborted)).toBe(true);
  }finally{vi.useRealTimers();}
});
