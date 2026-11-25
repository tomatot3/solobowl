import {randomUUID} from "node:crypto";
import {expect,it} from "vitest";
import {isolatedSchema} from "../support/isolated-schema";
import {loadMigrations,runMigrations} from "../../src/server/db/migrate";

it("isolates consent by account and purpose and permits a fresh consent after withdrawal", async () => {
  const db = await isolatedSchema();
  try {
    await runMigrations(db.pool, await loadMigrations());
    const alice = randomUUID();
    const bob = randomUUID();
    for (const id of [alice,bob]) {
      await db.pool.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES ($1,$2,$3,true)', [id,"TEST",`${id}@example.invalid`]);
    }
    const consent = randomUUID();
    const grant = (id: string) => db.pool.query(
      "INSERT INTO profile_consent(id,account_id,purpose,notice_version) VALUES ($1,$2,'safety','test')",
      [id,alice],
    );
    await grant(consent);
    await expect(grant(randomUUID())).rejects.toMatchObject({code:"23505"});
    const save = (id: string, section: string) => db.pool.query(
      "INSERT INTO profile_section(account_id,section,state,consent_id,revision) VALUES ($1,$2,'explicit_none',$3,1)",
      [id,section,consent],
    );
    await expect(save(bob,"safety")).rejects.toMatchObject({code:"23503"});
    await expect(save(alice,"preferences")).rejects.toMatchObject({code:"23503"});
    await save(alice,"safety");
    await db.pool.query("UPDATE profile_consent SET revoked_at=now() WHERE id=$1",[consent]);
    await grant(randomUUID());
    await db.pool.query("UPDATE profile_section SET state='unknown',consent_id=NULL,revision=2,deletion_generation=1 WHERE account_id=$1",[alice]);
    const result = await db.pool.query("SELECT state,consent_id,deletion_generation FROM profile_section WHERE account_id=$1",[alice]);
    expect(result.rows).toEqual([{state:"unknown",consent_id:null,deletion_generation:1}]);
  } finally {
    await db.close();
  }
});
