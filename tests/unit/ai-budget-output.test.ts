import {expect,it,vi} from "vitest";
import {enhanceReasons,ProviderError,validateReasonReply,type AiCandidate} from "../../src/server/ai/enhance";
const candidates:AiCandidate[]=[
  {recipeId:"r1",versionId:"v1",role:"primary",factors:["season_term"]},
  {recipeId:"r2",versionId:"v2",role:"alternative",factors:["winter_recipe"]},
];
const json=()=>JSON.stringify({items:candidates.map(({factors,...item})=>({...item,reasonFactors:factors}))});
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
