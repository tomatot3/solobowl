import "server-only";
import type pg from "pg";
import {readConfig} from "../config";
import {createDatabasePool} from "./pool";
const runtime=globalThis as typeof globalThis & {shiyoushuDatabasePool?:pg.Pool};
export function getDatabasePool():pg.Pool{
 if(!runtime.shiyoushuDatabasePool){const config=readConfig();if(!config.DATABASE_URL)throw new Error("DATABASE_URL is not configured");runtime.shiyoushuDatabasePool=createDatabasePool(config.DATABASE_URL);}
 return runtime.shiyoushuDatabasePool;
}
export async function closeDatabasePool():Promise<void>{const pool=runtime.shiyoushuDatabasePool;delete runtime.shiyoushuDatabasePool;if(pool)await pool.end();}
