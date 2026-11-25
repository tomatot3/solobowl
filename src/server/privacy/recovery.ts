import type pg from "pg";
import {z} from "zod";
import {withTransaction} from "../db/pool";

const target=z.discriminatedUnion("entityType",[
  z.object({entityType:z.literal("profile"),entityId:z.enum(["safety","preferences","equipment"])}),
  z.object({entityType:z.literal("today_state"),entityId:z.iso.date()}),
]);
const barrier=z.object({accountId:z.uuid(),generation:z.number().int().positive().max(2147483646)}).and(target);
type PrivacyBarrier=z.infer<typeof barrier>;

export async function readPrivacyBarriers(pool:pg.Pool):Promise<PrivacyBarrier[]>{
  const result=await pool.query(`SELECT account_id AS "accountId",entity_type AS "entityType",entity_id AS "entityId",generation
    FROM sync_barrier WHERE entity_type IN ('profile','today_state') ORDER BY account_id,entity_type,entity_id`);
  return z.array(barrier).parse(result.rows);
}

/** Apply the post-backup privacy ledger before opening a restored database to requests. */
export async function applyPrivacyBarriers(pool:pg.Pool,input:unknown){
  const barriers=z.array(barrier).parse(input);
  await withTransaction(pool,async client=>{
    for(const row of barriers){
      const account=await client.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE',[row.accountId]);
      if(!account.rowCount)continue;
      const prior=(await client.query<{generation:number}>(`SELECT generation FROM sync_barrier
        WHERE account_id=$1 AND entity_type=$2 AND entity_id=$3`,[row.accountId,row.entityType,row.entityId])).rows[0]?.generation??0;
      if(prior>=row.generation)continue;
      if(row.entityType==="profile"){
        const cleared=await client.query(`INSERT INTO profile_section(account_id,section,state,revision,deletion_generation)
          VALUES($1,$2,'unknown',1,$3) ON CONFLICT(account_id,section) DO UPDATE SET
          state='unknown',payload='{}',consent_id=NULL,revision=profile_section.revision+1,
          deletion_generation=EXCLUDED.deletion_generation,updated_at=now()
          WHERE profile_section.deletion_generation<EXCLUDED.deletion_generation`,[row.accountId,row.entityId,row.generation]);
        if(cleared.rowCount)await client.query(`UPDATE profile_consent SET revoked_at=now()
          WHERE account_id=$1 AND purpose=$2 AND revoked_at IS NULL`,[row.accountId,row.entityId]);
      }else{
        await client.query('DELETE FROM today_state WHERE account_id=$1 AND business_date=$2',[row.accountId,row.entityId]);
        await client.query(`DELETE FROM merge_conflict WHERE account_id=$1 AND section='today_state'
          AND guest_values->>'businessDate'=$2`,[row.accountId,row.entityId]);
        await client.query(`UPDATE merge_session m SET status='cancelled',revision=revision+1
          WHERE m.account_id=$1 AND m.status IN ('pending','partial')
          AND NOT EXISTS(SELECT 1 FROM merge_conflict WHERE merge_id=m.id)`,[row.accountId]);
      }
      await client.query(`INSERT INTO sync_barrier(account_id,entity_type,entity_id,generation) VALUES($1,$2,$3,$4)
        ON CONFLICT(account_id,entity_type,entity_id) DO UPDATE SET generation=GREATEST(sync_barrier.generation,EXCLUDED.generation)`,
      [row.accountId,row.entityType,row.entityId,row.generation]);
    }
  });
}
