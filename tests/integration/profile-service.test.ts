import {randomUUID} from "node:crypto";
import {expect,it} from "vitest";
import {isolatedSchema} from "../support/isolated-schema";
import {loadMigrations,runMigrations} from "../../src/server/db/migrate";
import {createProfileService} from "../../src/server/profile/service";
import {accountId} from "../../src/domain/shared/validation";

it("keeps consent tied to its owner and blocks stale writes after clearing a section",async () => {
  const db=await isolatedSchema();
  try {
    await runMigrations(db.pool,await loadMigrations());
    const accounts=[accountId(randomUUID()),accountId(randomUUID())] as const;
    for(const id of accounts) {
      await db.pool.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)',[id,"TEST",id+"@example.invalid"]);
    }
    const [owner,other]=accounts;
    const service=createProfileService(db.pool,{allergies:new Set(["fixture-id"])});
    const input={baseRevision:0,deletionGeneration:0,values:{allergies:{state:"provided",ids:["fixture-id","fixture-id"]}}};
    await expect(service.save(owner,"safety",input)).rejects.toMatchObject({code:"CONSENT_REQUIRED"});
    const grant=await service.grant(owner,"safety");
    await expect(service.save(other,"safety",{...input,consentRef:grant.id})).rejects.toMatchObject({code:"CONSENT_REQUIRED"});
    const saved=await service.save(owner,"safety",{...input,consentRef:grant.id});
    expect(saved.values.allergies).toEqual({state:"provided",ids:["fixture-id"]});
    const prefGrant=await service.grant(owner,"preferences");
    await expect(service.save(owner,"preferences",{...input,consentRef:prefGrant.id})).rejects.toMatchObject({code:"INVALID_INPUT"});
    expect((await service.read(owner)).sections.safety).toEqual(saved);
    expect(await service.read(other)).toEqual({consents:[],sections:{}});
    await service.revoke(owner,grant.id,grant.revision);
    expect((await service.read(owner)).consents.map(consent=>consent.id)).toEqual([prefGrant.id]);
    const fresh={baseRevision:1,deletionGeneration:0};
    await expect(service.save(owner,"safety",{...input,...fresh,consentRef:grant.id})).rejects.toMatchObject({code:"CONSENT_REQUIRED"});
    expect(await service.remove(owner,"safety","all",fresh)).toEqual({revision:2,deletionGeneration:1});
    expect((await service.read(owner)).sections.safety).toMatchObject({state:"unknown",values:{},consentRef:null});
    await expect(service.save(owner,"safety",{...input,...fresh,consentRef:grant.id})).rejects.toMatchObject({code:"REVISION_CONFLICT"});
  } finally {await db.close();}
});

it("requires new explicit consent before reintroducing an item deleted from a populated section",async()=>{
  const db=await isolatedSchema();
  try{
    await runMigrations(db.pool,await loadMigrations());
    const id=accountId(randomUUID());
    await db.pool.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)',[id,"TEST",id+"@example.invalid"]);
    const service=createProfileService(db.pool,{allergies:new Set(["fixture-id"])});
    const values={allergies:{state:"provided",ids:["fixture-id"]},avoidances:{state:"explicit_none",ids:[]}};
    const original=await service.grant(id,"safety");
    await service.save(id,"safety",{baseRevision:0,deletionGeneration:0,values,consentRef:original.id});
    await service.remove(id,"safety","allergies",{baseRevision:1,deletionGeneration:0});
    expect((await service.read(id)).sections.safety?.values).toEqual({avoidances:values.avoidances});
    const updated={baseRevision:2,deletionGeneration:1,values};
    await expect(service.save(id,"safety",{...updated,consentRef:original.id})).rejects.toMatchObject({code:"CONSENT_REQUIRED"});
    const consent=await service.grant(id,"safety");
    expect(consent.id).not.toBe(original.id);
    expect(consent.deletionGeneration).toBe(1);
    expect((await service.save(id,"safety",{...updated,consentRef:consent.id})).values).toEqual(values);
  }finally{await db.close();}
});
