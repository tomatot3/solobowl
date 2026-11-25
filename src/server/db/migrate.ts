import {createHash} from "node:crypto";
import {readdir,readFile} from "node:fs/promises";
import {resolve} from "node:path";
import type pg from "pg";
import {withTransaction} from "./pool";
export type Migration=Readonly<{id:string;sql:string;sha256:string}>;
export class MigrationError extends Error{constructor(public readonly code:string,message:string){super(message);this.name="MigrationError";}}
export function makeMigration(id:string,sql:string):Migration{
 if(!/^\d{3}_[a-z0-9_]+\.sql$/.test(id)||!sql.trim())throw new MigrationError("INVALID_MIGRATION","Migration requires an ordered SQL filename and nonempty SQL");
 const normalized=sql.replaceAll("\r\n","\n");return Object.freeze({id,sql:normalized,sha256:createHash("sha256").update(normalized).digest("hex")});
}
export async function loadMigrations(directory=resolve(process.cwd(),"src/server/db/migrations")):Promise<Migration[]>{
 const names=(await readdir(directory)).filter(name=>name.endsWith(".sql")).sort();
 const migrations=[];for(const name of names)migrations.push(makeMigration(name,await readFile(resolve(directory,name),"utf8")));return migrations;
}
export async function runMigrations(pool:pg.Pool,migrations:readonly Migration[]):Promise<{applied:string[]}>{
 const ordered=[...migrations].sort((a,b)=>a.id.localeCompare(b.id,"en"));
 if(new Set(ordered.map(m=>m.id)).size!==ordered.length)throw new MigrationError("INVALID_MIGRATION","Duplicate migration identity");
 for(const m of ordered)if(makeMigration(m.id,m.sql).sha256!==m.sha256)throw new MigrationError("INVALID_MIGRATION","Migration payload does not match its checksum");
 try{return await withTransaction(pool,async client=>{
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('shiyoushu.schema.migrations',0))");
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations(id text PRIMARY KEY,sha256 char(64) NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())");
  const rows=(await client.query<{id:string;sha256:string}>("SELECT id,sha256 FROM schema_migrations ORDER BY id")).rows;
  const known=new Map(ordered.map(m=>[m.id,m]));
  for(const row of rows){const current=known.get(row.id);if(!current)throw new MigrationError("MIGRATION_SET_BEHIND","Database contains a migration absent from this code version");if(current.sha256!==row.sha256)throw new MigrationError("APPLIED_MIGRATION_CHANGED","Applied migration checksum differs; create a new migration instead");}
  const applied:string[]=[];const done=new Set(rows.map(r=>r.id));
  for(const m of ordered){if(done.has(m.id))continue;await client.query(m.sql);await client.query("INSERT INTO schema_migrations(id,sha256) VALUES($1,$2)",[m.id,m.sha256]);applied.push(m.id);}
  return {applied};
 });}catch(error){if(error instanceof MigrationError)throw error;throw new MigrationError("MIGRATION_FAILED","Migration transaction failed and was rolled back; SQL and credentials are not logged");}
}
