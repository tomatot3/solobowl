import "fake-indexeddb/auto";
import Dexie from "dexie";
import {afterEach,describe,expect,it} from "vitest";
import {owner} from "../../src/domain/shared/validation";
import {LocalStore,storageName,LOCAL_STORAGE_NOTICE} from "../../src/client/storage/database";
const id="8cf0bc94-54ed-48f1-b332-cc4680020626",other="6b2883b6-01a7-47bd-b561-28748df460bb";
const stores:LocalStore[]=[];
function open(kind:"guest"|"account",value=id){const store=new LocalStore(owner(kind,value));stores.push(store);return store;}
afterEach(async()=>{for(const store of stores.splice(0))await store.destroy();});
describe("isolated local namespaces and migration",()=>{
 it("isolates the same entity ID in guest and two account stores",async()=>{
  const guest=open("guest"),account=open("account"),second=open("account",other);
  await guest.put("profile","same",{text:"guest"});await account.put("profile","same",{text:"account"});
  expect(await guest.get("profile","same")).toEqual({text:"guest"});expect(await account.get("profile","same")).toEqual({text:"account"});expect(await second.get("profile","same")).toBeUndefined();
  expect(storageName(owner("guest",id))).not.toBe(storageName(owner("account",id)));
  expect(LOCAL_STORAGE_NOTICE).toContain("清除站点数据");
 });
 it("isolates outbox by scope and rejects cloud destinations for guest operations",async()=>{
  const guest=open("guest"),account=open("account");
  await expect(guest.enqueue({operationId:id,collection:"profile",entityId:id,destination:"cloud",payload:{}})).rejects.toThrow("GUEST_CLOUD_WRITE_FORBIDDEN");
  await guest.enqueue({operationId:id,collection:"profile",entityId:id,destination:"local",payload:{guest:true}});
  await account.enqueue({operationId:id,collection:"profile",entityId:id,destination:"cloud",payload:{account:true}});
  expect((await guest.pending())[0]?.payload).toEqual({guest:true});expect((await account.pending())[0]?.payload).toEqual({account:true});
  await expect(account.enqueue({operationId:id,collection:"profile",entityId:id,destination:"cloud",payload:{different:true}})).rejects.toThrow();
 });
 it("preserves v1 data when adding the v2 outbox/barrier schema",async()=>{
  const own=owner("guest",other);const legacy=new Dexie(storageName(own));legacy.version(1).stores({entities:"[collection+id],collection",meta:"key"});
  await legacy.table("entities").put({collection:"profile",id:"old",value:{legacy:true}});legacy.close();
  const store=open("guest",other);expect(await store.get("profile","old")).toEqual({legacy:true});
  expect(await store.pending()).toEqual([]);expect(await store.schemaVersion()).toBe(2);
 });
 it("clears only its namespace and rejects use after destruction",async()=>{
  const guest=open("guest"),account=open("account");await guest.put("profile","x",{saved:true});await account.put("profile","x",{saved:true});
  await account.destroy();expect(await guest.get("profile","x")).toEqual({saved:true});await expect(account.get("profile","x")).rejects.toThrow("LOCAL_STORE_CLOSED");
 });
});
