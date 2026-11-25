import {randomUUID} from "node:crypto";
import {expect,it} from "vitest";
import {isolatedSchema} from "../support/isolated-schema";
import {seedTestFixtures} from "../support/seed-fixtures";
import {loadMigrations,runMigrations} from "../../src/server/db/migrate";
import {withTransaction} from "../../src/server/db/pool";
import {createTaskService} from "../../src/server/tasks/service";
import {fixtureId} from "../fixtures/recipes";
import {accountId} from "../../src/domain/shared/validation";
import {shoppingRows} from "../../src/domain/shopping/aggregate";
import {changeLifecycle} from "../../src/server/content/lifecycle";

it("deduplicates simultaneous creates, recalculates shopping, and completes an archived task once",async()=>{
  const db=await isolatedSchema();
  try{
    await runMigrations(db.pool,await loadMigrations());await seedTestFixtures(db.pool);
    const owner=accountId(randomUUID()),other=accountId(randomUUID());
    for(const id of [owner,other])await db.pool.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)',[id,"TEST",id+"@example.invalid"]);
    const api=createTaskService(db.pool,"test-secret");
    const create={kind:"create" as const,recipeId:fixtureId(100),versionId:fixtureId(101),optionId:fixtureId(104)};
    const [first,second]=await Promise.all([api.apply(owner,randomUUID(),create),api.apply(owner,randomUUID(),create)]);
    expect(first.taskId).toBe(second.taskId);
    const task=first.workspace.tasks[0]!;
    const selected=await api.apply(owner,randomUUID(),{kind:"select",revision:0,selected:[task.id]});
    const row=shoppingRows(selected.workspace)[0]!;
    expect(row.quantity).toBe("100");
    await api.apply(owner,randomUUID(),{kind:"edit",revision:1,rowId:row.id,quantity:"120",purchased:true});
    const changed=await api.apply(owner,randomUUID(),{kind:"serving",id:task.id,revision:1,optionId:fixtureId(112)});
    expect(changed.workspace.tasks[0]?.snapshot.contentHash).toBe(task.snapshot.contentHash);
    expect(shoppingRows(changed.workspace)[0]).toMatchObject({quantity:"180",override:"120",purchased:false,needsReview:true,contributions:[{appliedServingRevision:2}]});
    await expect(api.apply(other,randomUUID(),{kind:"task",id:task.id,revision:2,action:"start"})).rejects.toMatchObject({code:"RESOURCE_NOT_FOUND"});
    await withTransaction(db.pool,async client=>{
      await client.query("UPDATE recipe SET current_published_version_id=NULL WHERE id=$1",[create.recipeId]);
      await client.query("UPDATE recipe_lifecycle SET state='archived',revision=revision+1 WHERE version_id=$1",[create.versionId]);
    });
    await api.apply(owner,randomUUID(),{kind:"task",id:task.id,revision:2,action:"start"});
    const done={kind:"task" as const,id:task.id,revision:3,action:"complete" as const};
    const finished=await api.apply(owner,randomUUID(),done);
    expect(finished.workspace.tasks[0]).toMatchObject({state:"completed",completionServing:{optionId:fixtureId(112),revision:2}});
    expect(await api.apply(owner,randomUUID(),done)).toMatchObject({workspace:finished.workspace});
    await expect(api.apply(owner,randomUUID(),create)).rejects.toMatchObject({code:"RECIPE_UNAVAILABLE"});
  }finally{await db.close();}
});

it("prevents stale shopping writes and makes a new task when a published recipe is cooked again",async()=>{
  const db=await isolatedSchema();
  try{
    await runMigrations(db.pool,await loadMigrations());
    await seedTestFixtures(db.pool);
    const owner=accountId(randomUUID());
    await db.pool.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)',[owner,"TEST",owner+"@example.invalid"]);
    const service=createTaskService(db.pool,"test-secret");
    const create={kind:"create" as const,recipeId:fixtureId(100),versionId:fixtureId(101),optionId:fixtureId(104)};
    const first=(await service.apply(owner,randomUUID(),create)).workspace.tasks[0]!;
    const selected=await service.apply(owner,randomUUID(),{kind:"select",revision:0,selected:[first.id]});
    const ingredient=shoppingRows(selected.workspace)[0]!;
    const edits=await Promise.allSettled(["120","130"].map(quantity=>service.apply(owner,randomUUID(),{
      kind:"edit",revision:selected.workspace.shopping.revision,rowId:ingredient.id,quantity,
    })));
    const accepted=edits.find(edit=>edit.status==="fulfilled");
    const rejected=edits.find(edit=>edit.status==="rejected");
    expect(accepted?.status).toBe("fulfilled");
    expect(rejected?.reason).toMatchObject({code:"REVISION_CONFLICT"});
    expect(shoppingRows(await service.list(owner))).toEqual(shoppingRows(accepted!.value.workspace));

    await service.apply(owner,randomUUID(),{kind:"task",id:first.id,revision:1,action:"start"});
    const complete={kind:"task" as const,id:first.id,revision:2,action:"complete" as const};
    const finished=await service.apply(owner,randomUUID(),complete);
    expect(shoppingRows(finished.workspace)).toEqual([]);
    await service.apply(owner,randomUUID(),complete);
    const next=await service.apply(owner,randomUUID(),create);
    expect(next.taskId).not.toBe(first.id);
    expect(next.workspace.tasks.filter(item=>item.state==="todo")).toHaveLength(1);
    expect(next.workspace.tasks.filter(item=>item.state==="completed")).toHaveLength(1);
    expect(shoppingRows(next.workspace)).toEqual([]);
    const completions=await db.pool.query("SELECT task_id FROM cooking_completion");
    expect(completions.rows).toEqual([{task_id:first.id}]);
    const second=next.workspace.tasks.find(item=>item.id===next.taskId)!;
    await service.apply(owner,randomUUID(),{kind:"task",id:second.id,revision:1,action:"start"});
    await changeLifecycle(db.pool,{versionId:create.versionId,state:"safety_withdrawn",operatorRef:"isolated test",reviewRef:"isolated test",publicNotice:"TEST ONLY"});
    for(const action of ["resume","complete"] as const){
      await expect(service.apply(owner,randomUUID(),{kind:"task",id:second.id,revision:2,action})).rejects.toMatchObject({code:"SAFETY_WITHDRAWN"});
    }
    expect((await service.list(owner)).tasks.find(item=>item.id===second.id)).toMatchObject({state:"cooking",revision:2,snapshot:{contentHash:first.snapshot.contentHash}});
    expect((await db.pool.query("SELECT task_id FROM cooking_completion")).rows).toEqual(completions.rows);
  }finally{await db.close();}
});
