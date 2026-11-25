import {describe,it,expect} from "vitest";
import pg from "pg";
import {validateTestDatabase,createTestPool} from "../support/test-database";
const testUrl=validateTestDatabase();
const devUrl=process.env.DATABASE_URL;
if(!devUrl)throw new Error("DATABASE_URL is required for the development/test isolation preflight");
async function mustRejectCrossConnection(source:string,target:string){
 const url=new URL(source);url.pathname=new URL(target).pathname;
 const c=new pg.Client({connectionString:url.toString(),connectionTimeoutMillis:5000});
 try{await expect(c.connect()).rejects.toMatchObject({code:"42501"});}finally{await c.end().catch(()=>{});}
}
describe("real PostgreSQL18 local database readiness",()=>{
 it("uses a dedicated PostgreSQL18 test database and non-superuser account",async()=>{
  const pool=createTestPool();try{
   const server=(await pool.query("SELECT current_database() AS database,current_setting('server_version_num')::int AS version")).rows[0];
   expect(server.version).toBeGreaterThanOrEqual(180000);expect(server.version).toBeLessThan(190000);
   expect(server.database).toBe(decodeURIComponent(new URL(testUrl).pathname.slice(1)));
   const role=(await pool.query("SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user")).rows[0];
   expect(role).toEqual({rolsuper:false,rolcreatedb:false,rolcreaterole:false});
  }finally{await pool.end();}
 });
 it("connects to a different development database without mutating it",async()=>{
  const c=new pg.Client({connectionString:devUrl,connectionTimeoutMillis:5000});await c.connect();try{
   const name=(await c.query("SELECT current_database() AS database")).rows[0].database;
   expect(name).toBe(decodeURIComponent(new URL(devUrl).pathname.slice(1)));
   expect(name).not.toBe(decodeURIComponent(new URL(testUrl).pathname.slice(1)));
  }finally{await c.end();}
 });
 it("denies test-account connections to development",async()=>{await mustRejectCrossConnection(testUrl,devUrl);});
 it("denies development-account connections to test",async()=>{await mustRejectCrossConnection(devUrl,testUrl);});
 it("can write and read a temporary test table and roll it back",async()=>{
  const pool=createTestPool();const c=await pool.connect();try{
   await c.query("BEGIN");try{
    await c.query("CREATE TEMP TABLE recovery_probe(value integer)");await c.query("INSERT INTO recovery_probe VALUES(18)");
    expect((await c.query("SELECT value FROM recovery_probe")).rows).toEqual([{value:18}]);
   }finally{await c.query("ROLLBACK");}
   expect((await c.query("SELECT to_regclass('pg_temp.recovery_probe') AS leftover")).rows[0].leftover).toBeNull();
  }finally{c.release();await pool.end();}
 });
});
