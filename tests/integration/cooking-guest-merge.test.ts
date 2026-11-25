import {randomUUID} from "node:crypto";
import {expect,it} from "vitest";
import {isolatedSchema} from "../support/isolated-schema";
import {seedTestFixtures} from "../support/seed-fixtures";
import {loadMigrations,runMigrations} from "../../src/server/db/migrate";
import {createTaskService} from "../../src/server/tasks/service";
import {createMergeService} from "../../src/server/merge/service";
import {fixtureId} from "../fixtures/recipes";
import {accountId} from "../../src/domain/shared/validation";
import {shoppingRows} from "../../src/domain/shopping/aggregate";

it("requires an explicit choice between different task progress and rebuilds shopping through the mapped task",async()=>{
  const db=await isolatedSchema();
  try{
    await runMigrations(db.pool,await loadMigrations());await seedTestFixtures(db.pool);
    const id=accountId(randomUUID());
    await db.pool.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)',[id,"TEST",id+"@example.invalid"]);
    const secret="testing-only";
    const tasks=createTaskService(db.pool,secret);
    const merged=createMergeService(db.pool,secret);
    const current=await tasks.apply(id,randomUUID(),{kind:"create",recipeId:fixtureId(100),versionId:fixtureId(101),optionId:fixtureId(104)});
    const original=current.workspace.tasks[0]!;
    const sourceId=randomUUID();
    const input={guestBatchId:randomUUID(),schemaVersion:1 as const,consent:true as const,records:[],cooking:{
      tasks:[{sourceId,recipeId:original.snapshot.recipeId,versionId:original.snapshot.id,contentHash:original.snapshot.contentHash,
        optionId:fixtureId(112),servingRevision:2,step:0,state:"cooking" as const,createdAt:original.createdAt,completedAt:null,timer:null,feedback:null}],
      selected:[sourceId],edits:{},
    }};
    const result=await merged.start(id,input);
    expect(result.status).toBe("pending");
    expect(result.conflicts[0]).toMatchObject({section:"task",accountValues:{servings:"1"},guestValues:{servings:"2"}});
    expect((await tasks.list(id)).tasks[0]?.state).toBe("todo");
    const resolved=await merged.resolve(id,result.id,{baseRevision:result.revision,operationId:randomUUID(),choices:[{conflictId:result.conflicts[0]!.id,choice:"guest"}]});
    expect(resolved.applied).toContain("shopping");
    const all=await tasks.list(id);
    expect(all.tasks).toHaveLength(1);
    expect(all.tasks[0]).toMatchObject({id:original.id,state:"cooking",servingOptionId:fixtureId(112)});
    expect(shoppingRows(all)[0]).toMatchObject({quantity:"180"});
    expect(await merged.start(id,input)).toEqual(resolved);
  }finally{await db.close();}
});
