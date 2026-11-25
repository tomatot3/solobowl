import pg from "pg";
export function createDatabasePool(connectionString:string, overrides:Pick<pg.PoolConfig,"max"|"options">={}):pg.Pool{
 try{const url=new URL(connectionString);if(!["postgres:","postgresql:"].includes(url.protocol)||!url.hostname||url.pathname.length<2)throw new Error();}catch{throw new Error("A valid PostgreSQL URL is required; its value is not logged");}
 if(overrides.max!==undefined&&(!Number.isInteger(overrides.max)||overrides.max<1||overrides.max>20))throw new Error("Pool size must be an integer from 1 to 20");
 const pool=new pg.Pool({...overrides,connectionString,max:overrides.max??5,connectionTimeoutMillis:5000,idleTimeoutMillis:30000,statement_timeout:10000,application_name:"shiyoushu"});
 pool.on("error",error=>{const rawCode=(error as Error & {code?:unknown}).code;const code=typeof rawCode==="string"&&/^[A-Z0-9_]{5,24}$/.test(rawCode)?rawCode:"DATABASE_UNAVAILABLE";console.error("[database] idle connection failure",code);});
 return pool;
}
export async function withTransaction<T>(pool:pg.Pool,work:(client:pg.PoolClient)=>Promise<T>):Promise<T>{
 const client=await pool.connect();let began=false,destroy=false;
 try{await client.query("BEGIN");began=true;const result=await work(client);await client.query("COMMIT");return result;}
 catch(error){if(began){try{await client.query("ROLLBACK");}catch{destroy=true;}}else destroy=true;throw error;}
 finally{client.release(destroy);}
}
