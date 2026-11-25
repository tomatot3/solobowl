import type pg from "pg";
import {z} from "zod";
import {withTransaction} from "../db/pool";
export const lifecycleInput=z.object({versionId:z.uuid(),state:z.enum(["archived","safety_withdrawn"]),
  operatorRef:z.string().trim().min(1).max(240),reviewRef:z.string().trim().min(1).max(240),publicNotice:z.string().trim().max(500).optional()}).strict();
export function changeLifecycle(pool:pg.Pool,input:z.infer<typeof lifecycleInput>){
  return withTransaction(pool,async client=>{
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('shiyoushu.content.publish',0))");
    const identity=(await client.query<{recipe_id:string}>("SELECT recipe_id FROM recipe_lifecycle WHERE version_id=$1",[input.versionId])).rows[0];
    if(!identity)throw new Error("UNKNOWN_RECIPE_VERSION");
    await client.query("SELECT id FROM recipe WHERE id=$1 FOR UPDATE",[identity.recipe_id]);
    const current=(await client.query<{state:string}>("SELECT state FROM recipe_lifecycle WHERE version_id=$1 FOR UPDATE",[input.versionId])).rows[0]!;
    if(current.state===input.state)return {versionId:input.versionId,state:input.state};
    if(current.state!=="published"&&!(current.state==="archived"&&input.state==="safety_withdrawn"))throw new Error("INVALID_LIFECYCLE_TRANSITION");
    if(input.state==="safety_withdrawn"&&!input.publicNotice)throw new Error("SAFETY_NOTICE_REQUIRED");
    await client.query("UPDATE recipe SET current_published_version_id=NULL WHERE current_published_version_id=$1",[input.versionId]);
    await client.query("UPDATE recipe_lifecycle SET state=$2,revision=revision+1,changed_at=now(),withdrawal_reason=$3 WHERE version_id=$1",
      [input.versionId,input.state,input.state==="safety_withdrawn"?input.publicNotice:null]);
    await client.query("INSERT INTO content_release_event(version_id,before_state,after_state,operator_ref,review_ref) VALUES($1,$2,$3,$4,$5)",
      [input.versionId,current.state,input.state,input.operatorRef,input.reviewRef]);
    return {versionId:input.versionId,state:input.state};
  });
}
