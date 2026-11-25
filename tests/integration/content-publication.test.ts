import {expect,it} from "vitest";
import {isolatedSchema} from "../support/isolated-schema";
import {loadMigrations,runMigrations} from "../../src/server/db/migrate";
import {recipeFixture} from "../fixtures/recipes";
import {publicationInput,publishReviewed} from "../../src/server/content/publish";
import {changeLifecycle} from "../../src/server/content/lifecycle";
import {createRecipeRepository} from "../../src/server/recipes/repository";
import {revision} from "../../src/domain/shared/validation";
import type {Workbook} from "../../src/domain/content/normalize";
import {saveStagedContent,stageContent} from "../../src/server/content/staging";

function workbook(version:string,sourceHash:string):Workbook{
  return {sourceHash,sheets:[
    {name:"菜谱",images:[],rows:[{row:1,cells:{A:"菜谱ID"}},{row:2,cells:{A:"R001",B:"测试菜谱",C:version,U:"5",V:10}}]},
    {name:"用料",images:[],rows:[{row:1,cells:{D:"用料"}},{row:2,cells:{A:"R001",B:version,C:1,D:"测试用料",E:"100",F:"g"}}]},
    {name:"步骤",images:[],rows:[{row:1,cells:{D:"操作"}},{row:2,cells:{A:"R001",B:version,C:1,D:"测试步骤",E:"1"}},{row:82,cells:{J:"孤立文字"}}]},
  ]};
}

it("publishes independently reviewed drafts once, keeps old versions, and honors withdrawal",async()=>{
  const db=await isolatedSchema();
  try{
    await runMigrations(db.pool,await loadMigrations());
    const fixture=recipeFixture();
    const sourceHash=fixture.version.sourceHash;
    const source=workbook(fixture.version.rawVersion,sourceHash);
    const staged=stageContent(source);
    expect(staged.report.issues).toEqual(expect.arrayContaining([expect.objectContaining({code:"ORPHAN_ROW",cell:"J82"})]));
    expect(staged.report).toMatchObject({drafts:1,eligibleForReview:1,publicationReady:0});
    await saveStagedContent(db.pool,source,staged);
    await saveStagedContent(db.pool,source,staged);
    const drafts=await db.pool.query("SELECT id,content_hash FROM content_draft WHERE source_id='R001'");
    expect(drafts.rowCount).toBe(1);
    const draft=drafts.rows[0];
    const repo=createRecipeRepository(db.pool);
    expect(await repo.listCurrentWinter()).toEqual([]);
    const data=publicationInput.parse({draftId:draft.id,sourceHash,draftHash:draft.content_hash,operatorRef:"test operator",reviewRef:"test approved",dictionaryReviewRef:"test dictionary",version:fixture.version});
    await expect(publishReviewed(db.pool,{...data,version:{...fixture.version,reviews:[]}})).rejects.toThrow("CONTENT_NOT_ELIGIBLE");
    await expect(publishReviewed(db.pool,{...data,version:{...fixture.version,image:"https://example.invalid/image.jpg"}})).rejects.toThrow("COVER_SOURCE_UNVERIFIED");
    await expect(publishReviewed(db.pool,{...data,version:{...fixture.version,sources:fixture.version.sources.map(entry=>({...entry,sourceType:"modern_advice"}))}})).rejects.toThrow("EVIDENCE_LEVEL_REQUIRED");
    const result=await publishReviewed(db.pool,data);
    expect((await repo.listCurrentWinter())[0]?.version.id).toBe(result.versionId);
    await expect(publishReviewed(db.pool,data)).rejects.toThrow("DRAFT_ALREADY_PUBLISHED");

    const secondHash="c".repeat(64);
    const replacement=recipeFixture(2,"published",{recipeId:fixture.version.recipeId,internalRevision:revision(2),rawVersion:"test-v2",sourceHash:secondHash});
    const secondSource=workbook(replacement.version.rawVersion,secondHash);
    await saveStagedContent(db.pool,secondSource,stageContent(secondSource));
    const newDraft=(await db.pool.query("SELECT id,content_hash FROM content_draft WHERE internal_revision=2")).rows[0];
    const next=await publishReviewed(db.pool,{...data,draftId:newDraft.id,draftHash:newDraft.content_hash,sourceHash:secondHash,version:replacement.version});
    expect((await repo.listCurrentWinter()).map(candidate=>candidate.version.id)).toEqual([next.versionId]);
    expect(await repo.getVersion(result.versionId)).toMatchObject({version:{contentHash:result.contentHash,name:fixture.version.name},lifecycle:{state:"archived"}});
    await changeLifecycle(db.pool,{versionId:next.versionId,state:"safety_withdrawn",operatorRef:"test operator",reviewRef:"test withdrawal",publicNotice:"TEST ONLY"});
    expect(await repo.listCurrentWinter()).toEqual([]);
    expect(await repo.getVersion(next.versionId)).toMatchObject({version:{contentHash:next.contentHash},lifecycle:{state:"safety_withdrawn",withdrawalReason:"TEST ONLY"}});
  }finally{await db.close();}
});
