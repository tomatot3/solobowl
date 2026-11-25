import {randomUUID} from "node:crypto";
import {expect,it} from "vitest";
import {isolatedSchema} from "../support/isolated-schema";
import {loadMigrations,runMigrations} from "../../src/server/db/migrate";
import {accountId} from "../../src/domain/shared/validation";
import {systemClock} from "../../src/domain/calendar/clock";
import {createProfileService} from "../../src/server/profile/service";
import {createSyncService,type Operation} from "../../src/server/sync/service";
import {applyPrivacyBarriers,readPrivacyBarriers} from "../../src/server/privacy/recovery";

it("clears restored sensitive rows and rejects replay using post-backup deletion generations",async()=>{
  const live=await isolatedSchema();
  const restored=await isolatedSchema();
  try{
    const id=accountId(randomUUID());
    const marker="fixture-allergy-private";
    const noteMarker="FIXTURE PRIVATE TODAY TEXT";
    const date=systemClock.businessDate();
    const migrations=await loadMigrations();
    const note:Operation={operationId:randomUUID(),entityType:"today_state",entityId:date,baseRevision:0,deletionGeneration:0,action:"save",patch:{text:noteMarker}};
    const original=await Promise.all([live,restored].map(async db=>{
      await runMigrations(db.pool,migrations);
      await db.pool.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES ($1,$2,$3,true)',[id,"TEST",id+"@example.invalid"]);
      const profile=createProfileService(db.pool,{allergies:new Set([marker])});
      const grant=await profile.grant(id,"safety");
      await profile.save(id,"safety",{baseRevision:0,deletionGeneration:0,values:{allergies:{state:"provided",ids:[marker]}},consentRef:grant.id});
      const sync=createSyncService(db.pool,"isolated-test-secrets");
      expect((await sync.mutations(id,[note]))[0]?.status).toBe("ack");
      return {profile,sync,grant};
    }));
    const [active,backup]=original;
    expect(JSON.stringify(await backup!.sync.bootstrap(id))).toContain(marker);
    expect((await backup!.sync.bootstrap(id)).today?.text).toBe(noteMarker);
    await active!.profile.remove(id,"safety","all",{baseRevision:1,deletionGeneration:0});
    expect((await active!.sync.mutations(id,[{...note,operationId:randomUUID(),action:"delete",baseRevision:1,patch:{}}]))[0]?.status).toBe("ack");
    const ledger=await readPrivacyBarriers(live.pool);
    expect(ledger).toHaveLength(2);
    expect(JSON.stringify(ledger)).not.toMatch(/FIXTURE PRIVATE TODAY TEXT|fixture-allergy-private/);
    await applyPrivacyBarriers(restored.pool,ledger);
    await applyPrivacyBarriers(restored.pool,ledger);
    const snapshot=await backup!.sync.bootstrap(id);
    expect(snapshot.barriers).toContainEqual({entityType:"profile",entityId:"safety",generation:1});
    expect(snapshot.profile.sections.safety).toMatchObject({state:"unknown",values:{},deletionGeneration:1});
    expect(snapshot.profile.consents).toEqual([]);
    expect(snapshot.today).toBeNull();
    expect((await backup!.sync.mutations(id,[{...note,operationId:randomUUID()}]))[0]?.status).toBe("conflict");
    await expect(backup!.profile.save(id,"safety",{baseRevision:1,deletionGeneration:0,consentRef:backup!.grant.id,
      values:{allergies:{state:"provided",ids:[marker]}}})).rejects.toMatchObject({code:"REVISION_CONFLICT"});
    for(const table of ["profile_section","today_state","sync_receipt","sync_change","sync_conflict","merge_conflict"]){
      const text=JSON.stringify((await restored.pool.query(`SELECT * FROM ${table}`)).rows);
      expect(text).not.toContain(marker);
      expect(text).not.toContain(noteMarker);
    }
  }finally{await Promise.all([live.close(),restored.close()]);}
});
