import {randomUUID} from "node:crypto";
import {expect,it} from "vitest";
import {isolatedSchema} from "../support/isolated-schema";
import {loadMigrations,runMigrations} from "../../src/server/db/migrate";
import {accountId} from "../../src/domain/shared/validation";
import {NOTICE_VERSION} from "../../src/domain/profile/sections";
import {systemClock} from "../../src/domain/calendar/clock";
import {createSyncService,type Operation} from "../../src/server/sync/service";
import {createMergeService,mergeInput} from "../../src/server/merge/service";
import {createProfileService} from "../../src/server/profile/service";
import {accountRecommendationContext} from "../../src/server/recommendations/account-settings";

it("synchronizes only to the signed-in account, replays by operation ID, and removes deleted data from future reads", async()=>{
  const db=await isolatedSchema();
  try{
    await runMigrations(db.pool,await loadMigrations());
    const first=accountId(randomUUID()),second=accountId(randomUUID());
    for(const id of [first,second]) await db.pool.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)',[id,"TEST",id+"@example.invalid"]);
    const sync=createSyncService(db.pool,"sync-integration-secret");
    const profile=createProfileService(db.pool);
    const before=await sync.bootstrap(first);
    await expect(sync.changes(second,before.cursor,100)).rejects.toMatchObject({code:"RESOURCE_NOT_FOUND"});
    const grant=await profile.grant(first,"preferences");
    const save:Operation={operationId:randomUUID(),entityType:"profile",entityId:"preferences",baseRevision:0,deletionGeneration:0,action:"save",patch:{values:{preferredMinutes:30},consentRef:grant.id}};
    const date=systemClock.businessDate();
    const today:Operation={operationId:randomUUID(),entityType:"today_state",entityId:date,baseRevision:0,deletionGeneration:0,action:"save",patch:{text:"SYNTHETIC PRIVATE NOTE"}};
    const batch=await sync.mutations(first,[save,{...save,operationId:randomUUID()},today]);
    expect(batch.map(item=>item.status)).toEqual(["ack","conflict","ack"]);
    const [conflict]= (await sync.bootstrap(first)).conflicts;
    expect(conflict?.section).toBe("preferences");
    await expect(sync.conflict(second,conflict!.id)).rejects.toMatchObject({code:"RESOURCE_NOT_FOUND"});
    const choice={operationId:randomUUID(),baseRevision:1,choice:"account" as const};
    const resolved=await sync.resolve(first,conflict!.id,choice);
    expect(await sync.resolve(first,conflict!.id,choice)).toEqual(resolved);
    expect((await sync.bootstrap(first)).conflicts).toEqual([]);
    expect(await sync.mutations(first,[save])).toEqual([batch[0]]);
    expect((await sync.mutations(first,[{...save,patch:{...save.patch,values:{preferredMinutes:60}}}]))[0]).toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
    expect((await sync.bootstrap(second)).today).toBeNull();
    expect((await sync.bootstrap(first)).today?.text).toBe("SYNTHETIC PRIVATE NOTE");
    const deletion:Operation={...today,operationId:randomUUID(),action:"delete",baseRevision:1,patch:{}};
    expect((await sync.mutations(first,[deletion]))[0]?.status).toBe("ack");
    expect((await sync.mutations(first,[{...today,operationId:randomUUID()}]))[0]?.status).toBe("conflict");
    const after=await sync.bootstrap(first);
    expect(after.today).toBeNull();
    expect(after.barriers).toContainEqual({entityType:"today_state",entityId:date,generation:1});
    expect(JSON.stringify(await sync.changes(first,before.cursor,100))).not.toContain("SYNTHETIC PRIVATE NOTE");
    expect(JSON.stringify((await db.pool.query("SELECT result FROM sync_receipt")).rows)).not.toContain("SYNTHETIC PRIVATE NOTE");
  }finally{await db.close();}
});

it("requires batch consent, preserves conflicting account values, and scrubs temporary guest values when deleted",async()=>{
  const db=await isolatedSchema();
  try{
    await runMigrations(db.pool,await loadMigrations());
    const id=accountId(randomUUID());
    await db.pool.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)',[id,"TEST",id+"@example.invalid"]);
    const profile=createProfileService(db.pool);
    const merges=createMergeService(db.pool,"merge-integration-secret");
    const grant=await profile.grant(id,"safety");
    expect(grant.noticeVersion).toBe(NOTICE_VERSION);
    const none={state:"explicit_none",ids:[]};
    await profile.save(id,"safety",{baseRevision:0,deletionGeneration:0,values:{allergies:none},consentRef:grant.id});
    const input={guestBatchId:randomUUID(),schemaVersion:1 as const,consent:true as const,records:[
      {section:"preferences" as const,values:{preferredMinutes:20}},
      {section:"safety" as const,values:{avoidances:none}},
    ]};
    expect(mergeInput.safeParse({...input,consent:false}).success).toBe(false);
    expect(await merges.pending(id)).toBeNull();
    const result=await merges.start(id,input);
    expect(result.status).toBe("partial");
    expect(result.applied).toEqual(["preferences"]);
    expect(result.conflicts[0]).toMatchObject({section:"safety",guestValues:{avoidances:none},accountValues:{allergies:none}});
    expect((await accountRecommendationContext(db.pool,id)).context.safetyConflict).toBe(true);
    expect(await merges.start(id,input)).toEqual(result);
    const choice={operationId:randomUUID(),baseRevision:result.revision,choices:[{conflictId:result.conflicts[0]!.id,choice:"account" as const}]};
    expect((await merges.resolve(id,result.id,choice)).status).toBe("completed");
    expect((await accountRecommendationContext(db.pool,id)).context.safetyConflict).toBe(false);
    const date=systemClock.businessDate();
    const note=await merges.start(id,{guestBatchId:randomUUID(),schemaVersion:1,consent:true,records:[
      {section:"today_state",values:{businessDate:date,text:"SYNTHETIC GUEST NOTE"}},
    ]});
    expect(note.applied).toEqual(["today_state"]);
    expect((await createSyncService(db.pool,"merge-integration-secret").bootstrap(id)).today?.text).toBe("SYNTHETIC GUEST NOTE");
    const next=await merges.start(id,{...input,guestBatchId:randomUUID()});
    expect(next.conflicts).toHaveLength(1);
    await profile.remove(id,"safety","all",{baseRevision:1,deletionGeneration:0});
    expect(await merges.read(id,next.id)).toMatchObject({status:"cancelled",conflicts:[]});
    await expect(merges.start(id,{...input,guestBatchId:randomUUID()})).rejects.toMatchObject({code:"DELETED_VALUE_CONFLICT"});
  }finally{await db.close();}
});
