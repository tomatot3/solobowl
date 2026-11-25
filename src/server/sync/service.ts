import {createHmac, timingSafeEqual} from "node:crypto";
import type pg from "pg";
import {lockAccount} from "../auth/account-access";
import {z} from "zod";
import type {AccountId} from "../../domain/shared/types";
import {systemClock} from "../../domain/calendar/clock";
import {consentInput, normalizeSection, patchInput, sectionName, stamp, NOTICE_VERSION, type Purpose} from "../../domain/profile/sections";
import {withTransaction} from "../db/pool";
import {ApiError} from "../http/envelope";
import {createProfileService} from "../profile/service";
import {createTodayStateService} from "../profile/today-state";
import {createFavoriteService} from "../favorites/service";
import {entityId} from "../../domain/shared/validation";
import {kitchenCommand} from "../../domain/tasks/commands";
import {createTaskService} from "../tasks/service";
import {approvedProfileOptions} from "../content/dictionary";

export const operationInput = stamp.extend({
  operationId:z.uuid(), entityType:z.enum(["profile","consent","today_state","favorite","task","timer","shopping","feedback"]),
  entityId:z.string().min(1).max(100), action:z.enum(["save","delete","grant","revoke"]),
  patch:z.record(z.string(),z.unknown()),
}).strict();
export type Operation = z.infer<typeof operationInput>;
type Ack = {operationId:string; status:"ack"; result:unknown};
type Change = {sequence:string;entityType:string;entityId:string;revision:number;kind:string};
type Barrier = {entityType:string;entityId:string;generation:number};
type Conflict = {id:string;operationId:string;section:Purpose;deletionGeneration:number;consentRef:string;proposed:Record<string,unknown>;requestHash:string};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object") {
    return "{" + Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>JSON.stringify(k)+":"+canonical(v)).join(",") + "}";
  }
  return JSON.stringify(value);
}

export function requestHash(secret: string, value: unknown): string {
  return createHmac("sha256",secret).update(canonical(value)).digest("base64url");
}
export {lockAccount};

export function createSyncService(pool: pg.Pool,secret: string) {
  function cursor(id: AccountId, sequence: string) {
    return sequence+"."+requestHash(secret,["sync",id,sequence]);
  }
  function sequenceFor(id: AccountId, value: string) {
    const [sequence,hash,...rest]=value.split(".");
    if (!sequence || !hash || rest.length || !/^\d{1,19}$/.test(sequence) || BigInt(sequence)>9223372036854775807n) throw new ApiError("RESOURCE_NOT_FOUND");
    const expected=requestHash(secret,["sync",id,sequence]);
    if (hash.length!==expected.length || !/^[A-Za-z0-9_-]+$/.test(hash) || !timingSafeEqual(Buffer.from(hash),Buffer.from(expected))) {
      throw new ApiError("RESOURCE_NOT_FOUND");
    }
    return sequence;
  }
  async function barriers(client: pg.PoolClient,id: AccountId) {
    return (await client.query<Barrier>(`SELECT entity_type AS "entityType",entity_id AS "entityId",max(generation)::integer AS generation
      FROM (
        SELECT entity_type,entity_id,generation FROM sync_barrier WHERE account_id=$1
        UNION ALL
        SELECT 'profile',section,deletion_generation FROM profile_section WHERE account_id=$1 AND deletion_generation>0
      ) protected GROUP BY entity_type,entity_id ORDER BY entity_type,entity_id`,[id])).rows;
  }
  async function findConflict(client:pg.PoolClient,id:AccountId,conflictId:string) {
    const item=(await client.query<Conflict>(`SELECT id,operation_id AS "operationId",section,deletion_generation AS "deletionGeneration",
      consent_id AS "consentRef",proposed,request_hash AS "requestHash" FROM sync_conflict WHERE id=$1 AND account_id=$2`,[conflictId,id])).rows[0];
    if(!item)throw new ApiError("RESOURCE_NOT_FOUND");
    return item;
  }
  async function storeConflict(client:pg.PoolClient,id:AccountId,operation:Operation,hash:string) {
    if(operation.entityType!=="profile"||!["safety","preferences"].includes(operation.entityId)||operation.action!=="save")return;
    const section=operation.entityId as Purpose;
    const profile=await createProfileService(pool,undefined,client).read(id);
    const current=profile.sections[section];
    if(!current||current.revision===operation.baseRevision||current.deletionGeneration!==operation.deletionGeneration)return;
    const input=patchInput.parse({...operation.patch,baseRevision:operation.baseRevision,deletionGeneration:operation.deletionGeneration});
    if(!profile.consents.some(grant=>grant.id===input.consentRef&&grant.purpose===section&&grant.noticeVersion===NOTICE_VERSION))return;
    let next;
    try{next=normalizeSection(section,input.values,await approvedProfileOptions(client));}catch(error){
      if(error instanceof Error&&(error.message==="UNKNOWN_PROFILE_OPTION"||error instanceof z.ZodError))throw new ApiError("INVALID_INPUT");
      throw error;
    }
    if(next.state==="unknown")return;
    return (await client.query<{id:string}>(`INSERT INTO sync_conflict(account_id,operation_id,request_hash,section,deletion_generation,consent_id,proposed)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[id,operation.operationId,hash,section,operation.deletionGeneration,input.consentRef,next.values])).rows[0]?.id;
  }
  async function apply(client: pg.PoolClient,id: AccountId,operation: Operation) {
    const profile=createProfileService(pool,undefined,client);
    const stamp={baseRevision:operation.baseRevision,deletionGeneration:operation.deletionGeneration};
    if(["task","shopping","timer","feedback"].includes(operation.entityType)){
      if(operation.deletionGeneration!==0)throw new ApiError("REVISION_CONFLICT");
      const command=kitchenCommand.parse(operation.patch);
      if("revision" in command && command.revision!==operation.baseRevision)throw new ApiError("INVALID_INPUT");
      const correctType=command.kind==="select"||command.kind==="edit"?"shopping"
        :command.kind==="feedback"?"feedback":command.kind==="task"&&command.action==="timer"?"timer":"task";
      if(correctType!==operation.entityType)throw new ApiError("INVALID_INPUT");
      if(command.kind==="create"&&(command.versionId!==operation.entityId||operation.baseRevision!==0))throw new ApiError("INVALID_INPUT");
      if("id" in command&&command.id!==operation.entityId)throw new ApiError("INVALID_INPUT");
      if(correctType==="shopping"&&operation.entityId!=="current")throw new ApiError("INVALID_INPUT");
      const result=await createTaskService(pool,secret,client).apply(id,operation.operationId,command);
      return {entityId:result.taskId??"current",revision:result.taskId?result.workspace.tasks.find(item=>item.id===result.taskId)?.revision:result.workspace.shopping.revision};
    }
    if(operation.entityType==="favorite"&&(operation.action==="save"||operation.action==="delete")){
      const recipeId=entityId(z.uuid().parse(operation.entityId));
      const saved=operation.action==="save";
      const patch=z.object({versionId:z.uuid().optional()}).strict().parse(operation.patch);
      const change=await createFavoriteService(pool,client).change(id,recipeId,{...stamp,saved,versionId:patch.versionId?entityId(patch.versionId):undefined});
      return {entityId:recipeId,revision:change?.revision??0,deletionGeneration:change?.deletionGeneration??0};
    }
    if (operation.entityType==="profile") {
      const section=sectionName.parse(operation.entityId);
      if (operation.action==="save") {
        const item=await profile.save(id,section,patchInput.parse({...operation.patch,...stamp}));
        return {entityId:section,revision:item.revision,deletionGeneration:item.deletionGeneration};
      }
      if (operation.action==="delete") {
        const {item}=z.object({item:z.string()}).strict().parse(operation.patch);
        return {entityId:section,...await profile.remove(id,section,item,stamp)};
      }
    }
    if (operation.entityType==="consent") {
      if (operation.action==="grant") {
        const {purpose}=consentInput.parse(operation.patch);
        if (operation.entityId!==purpose) throw new ApiError("INVALID_INPUT");
        const result=await profile.grant(id,purpose);
        return {entityId:result.id,revision:result.revision};
      }
      if (operation.action==="revoke") {
        z.object({}).strict().parse(operation.patch);
        return {entityId:operation.entityId,...await profile.revoke(id,z.uuid().parse(operation.entityId),stamp.baseRevision)};
      }
    }
    if (operation.entityType==="today_state") {
      if (operation.entityId!==systemClock.businessDate()) throw new ApiError("EXPIRED_STATE");
      const barrier=(await barriers(client,id)).find(b=>b.entityType==="today_state"&&b.entityId===operation.entityId);
      if ((barrier?.generation??0)!==stamp.deletionGeneration) throw new ApiError("REVISION_CONFLICT");
      const today=createTodayStateService(pool,systemClock,client);
      if (operation.action==="save") {
        const {text}=z.object({text:z.string().max(2000)}).strict().parse(operation.patch);
        const item=await today.save(id,operation.entityId,text,stamp.baseRevision);
        return {entityId:operation.entityId,revision:item.revision,deletionGeneration:stamp.deletionGeneration};
      }
      if (operation.action==="delete") {
        z.object({}).strict().parse(operation.patch);
        await today.remove(id,stamp.baseRevision);
        return {entityId:operation.entityId,deleted:true};
      }
    }
    throw new ApiError("NOT_READY");
  }

  return {
    bootstrap: (id: AccountId) => withTransaction(pool,async client=>{
      await lockAccount(client,id);
      const profile=await createProfileService(pool,undefined,client).read(id);
      const today=await createTodayStateService(pool,systemClock,client).read(id);
      const row=(await client.query<{sequence:string}>("SELECT COALESCE(max(sequence),0)::text AS sequence FROM sync_change WHERE account_id=$1",[id])).rows[0]!;
      const conflicts=(await client.query<{id:string;section:Purpose;operationId:string}>(`SELECT id,section,operation_id AS "operationId"
        FROM sync_conflict WHERE account_id=$1 ORDER BY id`,[id])).rows;
      const kitchen=await createTaskService(pool,secret,client).list(id);
      return {accountId:id,profile,today,kitchen,barriers:await barriers(client,id),cursor:cursor(id,row.sequence),conflicts};
    }),
    changes: (id: AccountId,value: string,limit: number) => withTransaction(pool,async client=>{
      const sequence=sequenceFor(id,value);
      await lockAccount(client,id);
      const rows=(await client.query<Change>(`SELECT sequence::text,entity_type AS "entityType",entity_id AS "entityId",revision,kind
        FROM sync_change WHERE account_id=$1 AND sequence>$2::bigint ORDER BY sync_change.sequence LIMIT $3`,[id,sequence,limit+1])).rows;
      const changes=rows.slice(0,limit);
      return {changes,barriers:await barriers(client,id),nextCursor:cursor(id,changes.at(-1)?.sequence??sequence),hasMore:rows.length>limit};
    }),
    conflict:(id:AccountId,conflictId:string)=>withTransaction(pool,async client=>{
      await lockAccount(client,id);
      const item=await findConflict(client,id,conflictId);
      const current=(await createProfileService(pool,undefined,client).read(id)).sections[item.section];
      return {id:item.id,section:item.section,operationId:item.operationId,proposed:item.proposed,
        current:current?.values??{},revision:current?.revision??0};
    }),
    resolve:(id:AccountId,conflictId:string,input:{choice:"device"|"account";baseRevision:number;operationId:string})=>withTransaction(pool,async client=>{
      await lockAccount(client,id);
      const hash=requestHash(secret,["sync-resolve",conflictId,input]);
      const previous=(await client.query<{request_hash:string;result:{entityId:string;revision:number;operationId:string}}>(
        "SELECT request_hash,result FROM sync_receipt WHERE account_id=$1 AND operation_id=$2",[id,input.operationId])).rows[0];
      if(previous){
        if(previous.request_hash!==hash) throw new ApiError("IDEMPOTENCY_CONFLICT");
        return previous.result;
      }
      const item=await findConflict(client,id,conflictId);
      const profile=createProfileService(pool,undefined,client);
      const current=(await profile.read(id)).sections[item.section];
      if((current?.revision??0)!==input.baseRevision||(current?.deletionGeneration??0)!==item.deletionGeneration)throw new ApiError("REVISION_CONFLICT");
      const revision=input.choice==="device"?(await profile.save(id,item.section,{values:item.proposed,consentRef:item.consentRef,
        baseRevision:input.baseRevision,deletionGeneration:item.deletionGeneration})).revision:input.baseRevision;
      await client.query("DELETE FROM sync_conflict WHERE id=$1 AND account_id=$2",[conflictId,id]);
      const result={entityId:item.section,revision,operationId:item.operationId};
      const ack:Ack={operationId:item.operationId,status:"ack",result};
      await client.query("INSERT INTO sync_receipt(account_id,operation_id,request_hash,result) VALUES($1,$2,$3,$4),($1,$5,$6,$7)",
        [id,input.operationId,hash,result,item.operationId,item.requestHash,ack]);
      return result;
    }),
    async mutations(id: AccountId, operations: Operation[]) {
      const results=[];
      for (const operation of operations) {
        try {
          const result=await withTransaction(pool,async client=>{
            await lockAccount(client,id);
            const hash=requestHash(secret,operation);
            const previous=(await client.query<{request_hash:string;result:Ack}>(
              "SELECT request_hash,result FROM sync_receipt WHERE account_id=$1 AND operation_id=$2",[id,operation.operationId])).rows[0];
            if (previous) {
              if (previous.request_hash!==hash) throw new ApiError("IDEMPOTENCY_CONFLICT");
              // Receipts carry identity and revision only; neither replay nor changes return old values.
              return previous.result;
            }
            const existingConflict=(await client.query<{id:string;request_hash:string}>(
              "SELECT id,request_hash FROM sync_conflict WHERE account_id=$1 AND operation_id=$2",[id,operation.operationId])).rows[0];
            if(existingConflict&&existingConflict.request_hash!==hash)throw new ApiError("IDEMPOTENCY_CONFLICT");
            const conflictId=existingConflict?.id??await storeConflict(client,id,operation,hash);
            if(conflictId)return {operationId:operation.operationId,status:"conflict",code:"REVISION_CONFLICT",conflictId} as const;
            const ack: Ack={operationId:operation.operationId,status:"ack",result:await apply(client,id,operation)};
            await client.query("INSERT INTO sync_receipt(account_id,operation_id,request_hash,result) VALUES($1,$2,$3,$4)",
              [id,operation.operationId,hash,ack]);
            return ack;
          });
          results.push(result);
        } catch (error) {
          if (!(error instanceof ApiError) && !(error instanceof z.ZodError)) throw error;
          const code=error instanceof ApiError ? error.code : "INVALID_INPUT";
          results.push({operationId:operation.operationId,status:["REVISION_CONFLICT","IDEMPOTENCY_CONFLICT"].includes(code)?"conflict":"rejected",code});
        }
      }
      return results;
    },
  };
}
