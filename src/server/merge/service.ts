import type pg from "pg";
import {z} from "zod";
import {type AccountId} from "../../domain/shared/types";
import {normalizeSection,type Purpose} from "../../domain/profile/sections";
import {withTransaction} from "../db/pool";
import {ApiError} from "../http/envelope";
import {createProfileService} from "../profile/service";
import {lockAccount,requestHash} from "../sync/service";
import {systemClock} from "../../domain/calendar/clock";
import {createTodayStateService} from "../profile/today-state";
import {createFavoriteService} from "../favorites/service";
import {entityId} from "../../domain/shared/validation";
import {approvedProfileOptions} from "../content/dictionary";
import {cookingTransfer,guestTask,type GuestTask,type CookingTransfer} from "../../domain/tasks/guest-transfer";
import {mergeGuestShopping,mergeGuestTask,readMergeTasks,taskLabel} from "../tasks/guest-merge";

const purpose=z.enum(["safety","preferences","today_state"]);
type MergeSection=z.infer<typeof purpose>;
const noteInput=z.object({businessDate:z.string(),text:z.string().max(2000)}).strict();
export const mergeInput=z.object({
  guestBatchId:z.uuid(),consent:z.literal(true),schemaVersion:z.literal(1),
  records:z.array(z.object({section:purpose,values:z.record(z.string(),z.unknown())}).strict()).max(3),
  favorites:z.array(z.object({recipeId:z.uuid(),versionId:z.uuid()}).strict()).max(50).optional(),
  cooking:cookingTransfer.optional(),
}).strict().refine(value=>Boolean(value.records.length||value.favorites?.length||value.cooking?.tasks.length)&&new Set(value.records.map(item=>item.section)).size===value.records.length);
export const resolveInput=z.object({
  baseRevision:z.number().int().min(1),
  operationId:z.uuid(),
  choices:z.array(z.object({conflictId:z.uuid(),choice:z.enum(["guest","account"])}).strict()).min(1).max(33),
}).strict().refine(value=>new Set(value.choices.map(item=>item.conflictId)).size===value.choices.length);

type Session = {id:string;status:"pending"|"partial"|"completed"|"cancelled";revision:number;applied:string[]};
type Conflict = {id:string;section:string;accountRevision:number;deletionGeneration:number;guestValues:Record<string,unknown>};
const taskProposal=z.object({source:guestTask,expectedId:z.uuid(),display:z.record(z.string(),z.unknown())}).strict();

export function createMergeService(pool:pg.Pool,secret:string) {
  function notes(client:pg.PoolClient) {return createTodayStateService(pool,systemClock,client);}
  async function clearExpiredNotes(client:pg.PoolClient,account:AccountId) {
    const result=await client.query("DELETE FROM merge_conflict WHERE account_id=$1 AND section='today_state' AND guest_values->>'businessDate'<>$2",[account,systemClock.businessDate()]);
    if(result.rowCount) await client.query(`UPDATE merge_session m SET status='cancelled',revision=revision+1
      WHERE account_id=$1 AND status IN ('pending','partial') AND NOT EXISTS(SELECT 1 FROM merge_conflict WHERE merge_id=m.id)`,[account]);
  }
  async function session(client:pg.PoolClient,account:AccountId,id:string) {
    const result=(await client.query<Session>("SELECT id,status,revision,applied FROM merge_session WHERE id=$1 AND account_id=$2",[id,account])).rows[0];
    if (!result) throw new ApiError("RESOURCE_NOT_FOUND");
    return result;
  }
  async function conflicts(client:pg.PoolClient,account:AccountId,id:string) {
    return (await client.query<Conflict>(`SELECT id,section,account_revision AS "accountRevision",
      deletion_generation AS "deletionGeneration",guest_values AS "guestValues" FROM merge_conflict
      WHERE merge_id=$1 AND account_id=$2 ORDER BY section`,[id,account])).rows;
  }
  async function view(client:pg.PoolClient,account:AccountId,id:string) {
    await clearExpiredNotes(client,account);
    const today=await notes(client).read(account);
    const merge=await session(client,account,id);
    const profile=await createProfileService(pool,undefined,client).read(account);
    const pending=await conflicts(client,account,id);
    const tasks=pending.some(item=>item.section.startsWith("task:"))?await readMergeTasks(client,account):[];
    return {...merge,conflicts:pending.map(conflict=>{
      if(conflict.section.startsWith("task:")){
        const {expectedId,display}=taskProposal.parse(conflict.guestValues);
        const task=tasks.find(item=>item.id===expectedId);
        return {id:conflict.id,section:"task",guestValues:display,accountValues:taskLabel(task)??{},changed:task?.revision!==conflict.accountRevision};
      }
      const section=conflict.section as MergeSection;
      const current=section==="today_state"?today&&{...today,values:{text:today.text}}:profile.sections[section];
      return {
        id:conflict.id,section:conflict.section,guestValues:conflict.guestValues,accountValues:current?.values??{},
        changed:(current?.revision??0)!==conflict.accountRevision,
      };
    })};
  }
  async function finalizeShopping(client:pg.PoolClient,id:AccountId,mergeId:string){
    const result=await client.query<Pick<CookingTransfer,"selected"|"edits">>("DELETE FROM merge_cooking_selection WHERE merge_id=$1 RETURNING selected,edits",[mergeId]);
    return result.rows[0]?mergeGuestShopping(client,id,result.rows[0]):false;
  }
  async function importSection(client:pg.PoolClient,id:AccountId,section:Purpose,values:Record<string,unknown>,revision:number) {
    const profile=createProfileService(pool,undefined,client);
    const grant=await profile.grant(id,section);
    await profile.save(id,section,{baseRevision:revision,deletionGeneration:0,values,consentRef:grant.id});
  }
  return {
    read:(id:AccountId,mergeId:string)=>withTransaction(pool,async client=>{
      await lockAccount(client,id);
      return view(client,id,mergeId);
    }),
    start:(id:AccountId,input:z.infer<typeof mergeInput>)=>withTransaction(pool,async client=>{
      await lockAccount(client,id);
      const hash=requestHash(secret,input.cooking?.tasks.length?[input.records,input.favorites??[],input.cooking]:input.favorites?.length?[input.records,input.favorites]:input.records);
      const previous=(await client.query<{id:string;request_hash:string}>(
        "SELECT id,request_hash FROM merge_session WHERE account_id=$1 AND batch_id=$2",[id,input.guestBatchId])).rows[0];
      if (previous) {
        if (previous.request_hash!==hash) throw new ApiError("IDEMPOTENCY_CONFLICT");
        return view(client,id,previous.id);
      }
      const unsettled=(await client.query(
        "SELECT id FROM merge_session WHERE account_id=$1 AND status IN ('pending','partial')",[id])).rows[0];
      if (unsettled) return view(client,id,unsettled.id);
      const profile=await createProfileService(pool,undefined,client).read(id);
      const today=await notes(client).read(id);
      const merge=(await client.query<{id:string}>(
        "INSERT INTO merge_session(account_id,batch_id,request_hash,status) VALUES($1,$2,$3,'completed') RETURNING id",
        [id,input.guestBatchId,hash])).rows[0]!;
      const applied:string[]=[];
      let pending=0;
      const approved=await approvedProfileOptions(client);
      for (const {section,values} of input.records) {
        if(section==="today_state"){
          const note=noteInput.parse(values);
          if(note.businessDate!==systemClock.businessDate())continue;
          const barrier=await client.query("SELECT 1 FROM sync_barrier WHERE account_id=$1 AND entity_type='today_state' AND entity_id=$2",[id,note.businessDate]);
          if(barrier.rowCount)throw new ApiError("DELETED_VALUE_CONFLICT");
          if(!today||today.text===note.text){
            if(!today)await notes(client).save(id,note.businessDate,note.text,0);
            applied.push(section);
          }else{
            await client.query(`INSERT INTO merge_conflict(merge_id,account_id,section,account_revision,deletion_generation,guest_values)
              VALUES($1,$2,$3,$4,0,$5)`,[merge.id,id,section,today.revision,note]);
            pending++;
          }
          continue;
        }
        let guest;
        try {guest=normalizeSection(section,values,approved);} catch {throw new ApiError("INVALID_INPUT");}
        if (guest.state==="unknown") throw new ApiError("INVALID_INPUT");
        const current=profile.sections[section];
        if (current?.deletionGeneration) throw new ApiError("DELETED_VALUE_CONFLICT");
        if (!current || current.state==="unknown") {
          await importSection(client,id,section,guest.values,current?.revision??0);
          applied.push(section);
        } else if (requestHash(secret,current.values)===requestHash(secret,guest.values)
          && profile.consents.some(grant=>grant.id===current.consentRef)) {
          applied.push(section);
        } else {
          await client.query(`INSERT INTO merge_conflict(merge_id,account_id,section,account_revision,deletion_generation,guest_values)
            VALUES($1,$2,$3,$4,0,$5)`,[merge.id,id,section,current.revision,guest.values]);
          pending++;
        }
      }
      let savedFavorites=0;
      let skippedFavorites=0;
      const favorites=createFavoriteService(pool,client);
      const seen=new Set<string>();
      for(const item of input.favorites??[]){
        if(seen.has(item.recipeId))continue;
        seen.add(item.recipeId);
        try{
          await favorites.change(id,entityId(item.recipeId),{saved:true,versionId:entityId(item.versionId),merge:true});
          savedFavorites++;
        }catch(error){
          if(!(error instanceof ApiError)||!["RESOURCE_NOT_FOUND","DELETED_VALUE_CONFLICT","SAFETY_CONFLICT"].includes(error.code))throw error;
          skippedFavorites++;
        }
      }
      if(savedFavorites)applied.push("favorites:"+savedFavorites);
      if(skippedFavorites)applied.push("favorites_skipped:"+skippedFavorites);
      if(input.cooking?.tasks.length){
        let imported=0;
        let skipped=0;
        for(const source of input.cooking.tasks){
          try{
            const result=await mergeGuestTask(pool,client,id,source);
            if(result.taskId){imported++;continue;}
            if(result.conflict){
              await client.query(`INSERT INTO merge_conflict(merge_id,account_id,section,account_revision,deletion_generation,guest_values)
                VALUES($1,$2,$3,$4,0,$5)`,[merge.id,id,"task:"+source.sourceId,result.conflict.revision,
                {source,expectedId:result.conflict.id,display:result.proposal}]);
              pending++;
            }
          }catch(error){
            if(!(error instanceof ApiError)||!["SAFETY_CONFLICT","RECIPE_UNAVAILABLE","INVALID_INPUT"].includes(error.code))throw error;
            skipped++;
          }
        }
        if(imported)applied.push("tasks:"+imported);
        if(skipped)applied.push("tasks_skipped:"+skipped);
        if(pending&&input.cooking.selected.length){
          await client.query("INSERT INTO merge_cooking_selection(merge_id,selected,edits) VALUES($1,$2,$3)",[merge.id,input.cooking.selected,input.cooking.edits]);
        }else if(await mergeGuestShopping(client,id,input.cooking))applied.push("shopping");
      }
      const status=pending?(applied.length?"partial":"pending"):"completed";
      await client.query("UPDATE merge_session SET status=$2,applied=$3 WHERE id=$1",[merge.id,status,applied]);
      return view(client,id,merge.id);
    }),
    resolve:(id:AccountId,mergeId:string,input:z.infer<typeof resolveInput>)=>withTransaction(pool,async client=>{
      await lockAccount(client,id);
      await clearExpiredNotes(client,id);
      const today=await notes(client).read(id);
      const hash=requestHash(secret,["merge-resolve",mergeId,input]);
      const receipt=(await client.query<{request_hash:string}>(
        "SELECT request_hash FROM sync_receipt WHERE account_id=$1 AND operation_id=$2",[id,input.operationId])).rows[0];
      if (receipt) {
        if (receipt.request_hash!==hash) throw new ApiError("IDEMPOTENCY_CONFLICT");
        return view(client,id,mergeId);
      }
      const merge=await session(client,id,mergeId);
      if (merge.revision!==input.baseRevision || !["pending","partial"].includes(merge.status)) throw new ApiError("REVISION_CONFLICT");
      const items=await conflicts(client,id,mergeId);
      const profile=await createProfileService(pool,undefined,client).read(id);
      const tasks=items.some(item=>item.section.startsWith("task:"))?await readMergeTasks(client,id):[];
      for (const item of items) {
        if(item.section.startsWith("task:")){
          const {expectedId}=taskProposal.parse(item.guestValues);
          const current=tasks.find(task=>task.id===expectedId);
          if(current&&current.revision!==item.accountRevision){
            await client.query("UPDATE merge_conflict SET account_revision=$2 WHERE id=$1",[item.id,current.revision]);
            await client.query("UPDATE merge_session SET revision=revision+1 WHERE id=$1",[mergeId]);
            return view(client,id,mergeId);
          }
          continue;
        }
        const section=item.section as MergeSection;
        const current=section==="today_state"?today&&{...today,deletionGeneration:0}:profile.sections[section];
        if ((current?.deletionGeneration??0)!==item.deletionGeneration) throw new ApiError("DELETED_VALUE_CONFLICT");
        if ((current?.revision??0)!==item.accountRevision) {
          await client.query("UPDATE merge_conflict SET account_revision=$2 WHERE id=$1",[item.id,current?.revision??0]);
          await client.query("UPDATE merge_session SET revision=revision+1 WHERE id=$1",[mergeId]);
          return view(client,id,mergeId);
        }
      }
      const applied=new Set(merge.applied);
      for (const choice of input.choices) {
        const item=items.find(record=>record.id===choice.conflictId);
        if (!item) throw new ApiError("RESOURCE_NOT_FOUND");
        if(item.section.startsWith("task:")){
          const {source,expectedId}=taskProposal.parse(item.guestValues) as {source:GuestTask;expectedId:string};
          await mergeGuestTask(pool,client,id,source,{mode:choice.choice,expectedId,revision:item.accountRevision});
          applied.add("task_selected");
        }else if (choice.choice==="guest") {
          if(item.section==="today_state"){
            const note=noteInput.parse(item.guestValues);
            await notes(client).save(id,note.businessDate,note.text,item.accountRevision);
          }else await importSection(client,id,item.section as Purpose,item.guestValues,item.accountRevision);
          applied.add(item.section);
        }
        await client.query("DELETE FROM merge_conflict WHERE id=$1",[item.id]);
      }
      const status=items.length===input.choices.length?"completed":"partial";
      if(status==="completed"&&await finalizeShopping(client,id,mergeId))applied.add("shopping");
      await client.query("UPDATE merge_session SET status=$2,revision=revision+1,applied=$3 WHERE id=$1",[mergeId,status,[...applied]]);
      await client.query("INSERT INTO sync_receipt(account_id,operation_id,request_hash,result) VALUES($1,$2,$3,$4)",
        [id,input.operationId,hash,{mergeId}]);
      return view(client,id,mergeId);
    }),
    cancel:(id:AccountId,mergeId:string)=>withTransaction(pool,async client=>{
      await lockAccount(client,id);
      const merge=await session(client,id,mergeId);
      if (["pending","partial"].includes(merge.status)) {
        await client.query("DELETE FROM merge_conflict WHERE merge_id=$1 AND account_id=$2",[mergeId,id]);
        await client.query("DELETE FROM merge_cooking_selection WHERE merge_id=$1",[mergeId]);
        await client.query("UPDATE merge_session SET status='cancelled',revision=revision+1 WHERE id=$1",[mergeId]);
      }
      return view(client,id,mergeId);
    }),
    async pending(id:AccountId) {
      return withTransaction(pool,async client=>{
        await lockAccount(client,id);
        await clearExpiredNotes(client,id);
        const row=(await client.query<{id:string}>(
          "SELECT id FROM merge_session WHERE account_id=$1 AND status IN ('pending','partial') ORDER BY id LIMIT 1",[id])).rows[0];
        return row ? view(client,id,row.id) : null;
      });
    },
  };
}
