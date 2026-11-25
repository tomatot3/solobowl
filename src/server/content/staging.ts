import {createHash} from "node:crypto";
import type pg from "pg";
import {stageWorkbook,type Workbook} from "../../domain/content/normalize";
import {withTransaction} from "../db/pool";

export function stageContent(source:Workbook){
  const staged=stageWorkbook(source);
  const report={sourceHash:staged.sourceHash,drafts:staged.drafts.length,eligibleForReview:staged.drafts.filter(row=>!row.issues.some(issue=>issue.severity==="error")).length,
    publicationReady:0,counts:source.sheets.map(sheet=>({sheet:sheet.name,rows:sheet.rows.length-1,images:sheet.images.length})),
    recipes:staged.drafts.map(row=>({sourceId:row.sourceId,rawVersion:row.rawVersion,totalMinutes:row.total})),issues:staged.issues};
  return {staged,report};
}

export async function saveStagedContent(pool:pg.Pool,source:Workbook,{staged,report}:ReturnType<typeof stageContent>){
  await withTransaction(pool,async client=>{
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('shiyoushu.content.import',0))");
    await client.query("INSERT INTO content_import_batch(source_hash,source,report) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[source.sourceHash,source,report]);
    for(const draft of staged.drafts){
      const content={sources:draft.sources.map(row=>row.cells),ingredients:draft.ingredients.map(row=>row.cells),steps:draft.steps.map(row=>row.cells),images:draft.images.map(item=>item.sha256)};
      const hash=createHash("sha256").update(JSON.stringify(content)).digest("hex");
      await client.query(`INSERT INTO content_draft(source_id,raw_version,internal_revision,source_hash,content_hash,review_state,draft)
        SELECT $1,$2,COALESCE(max(internal_revision),0)+1,$3,$4,$5,$6 FROM content_draft WHERE source_id=$1
        ON CONFLICT(source_id,raw_version,content_hash) DO NOTHING`,[draft.sourceId,draft.rawVersion,source.sourceHash,hash,draft.issues.some(issue=>issue.severity==="error")?"isolated":"pending",draft]);
    }
  });
}
