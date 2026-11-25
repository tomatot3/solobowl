import {randomUUID} from "node:crypto";
import {createTestPool,validateTestDatabase} from "./test-database";
import {createDatabasePool} from "../../src/server/db/pool";
export async function isolatedSchema(){
 const url=validateTestDatabase();
 const schema="shiyoushu_test_"+randomUUID().replaceAll("-","");
 const admin=createTestPool();await admin.query(`CREATE SCHEMA "${schema}"`);
 const pool=createDatabasePool(url,{max:3,options:`-c search_path=${schema}`});
 return {pool,schema,close:async()=>{
  await pool.end();validateTestDatabase();
  if(!/^shiyoushu_test_[a-f0-9]{32}$/.test(schema))throw new Error("Unsafe test schema cleanup");
  const actual=(await admin.query("SELECT current_database() AS name")).rows[0].name;
  if(actual!==decodeURIComponent(new URL(url).pathname.slice(1)))throw new Error("Refusing cleanup on unexpected database");
  try{await admin.query(`DROP SCHEMA "${schema}" CASCADE`);}finally{await admin.end();}
 }};
}
