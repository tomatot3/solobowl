import {describe,it,expect} from "vitest";
import {requireSyncAdapter,PortUnavailableError,type SyncAdapter} from "../../src/domain/shared/ports";
describe("missing adapters cannot acknowledge writes",()=>{
 it("rejects absent or unimplemented resources explicitly",()=>{
  expect(()=>requireSyncAdapter(new Map(),"profile")).toThrow(PortUnavailableError);
  expect(()=>requireSyncAdapter(new Map(),"task")).toThrow("ADAPTER_UNAVAILABLE");
 });
 it("returns only the explicitly registered adapter and propagates failure",async()=>{
  const adapter:SyncAdapter={apply:async()=>{throw new PortUnavailableError();}};
  const found=requireSyncAdapter(new Map([["profile",adapter]]),"profile");
  expect(found).toBe(adapter);await expect(found.apply({} as never,{} as never)).rejects.toMatchObject({code:"NOT_READY"});
 });
});
