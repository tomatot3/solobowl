import pg from "pg";
function parse(value: string, label: string) {
  try {const url=new URL(value);if (!["postgres:","postgresql:"].includes(url.protocol)) throw new Error();return url;}
  catch {throw new Error(label+" is not a valid PostgreSQL URL");}
}
function identity(url: URL) {
  const host=["localhost","127.0.0.1","[::1]"].includes(url.hostname)?"loopback":url.hostname.toLowerCase();
  let path: string;try{path=decodeURIComponent(url.pathname);}catch{throw new Error("Invalid database path encoding");}
  return host+":"+(url.port||"5432")+path;
}
export function validateTestDatabase(env: Readonly<Record<string, string | undefined>> = process.env): string {
  if (env.NODE_ENV === "production") throw new Error("Test database operations are forbidden in production");
  const value=env.TEST_DATABASE_URL;
  if (!value) throw new Error("TEST_DATABASE_URL is required; use a dedicated local test database");
  const target=parse(value,"TEST_DATABASE_URL");
  if (!["localhost","127.0.0.1","[::1]"].includes(target.hostname)) throw new Error("Test database must use an explicit local loopback host");
  let name: string;try{name=decodeURIComponent(target.pathname.slice(1));}catch{throw new Error("Invalid test database name");}
  if (!/^[a-z][a-z0-9_]*_test(?:_[a-z0-9]+)?$/i.test(name)) throw new Error("Dedicated test database name must end in _test or _test_suffix");
  if (env.DATABASE_URL && identity(target)===identity(parse(env.DATABASE_URL,"DATABASE_URL"))) throw new Error("Test database cannot be the development database, even with different credentials or loopback aliases");
  return value;
}
export function createTestPool(env: Readonly<Record<string, string | undefined>> = process.env): pg.Pool {
  return new pg.Pool({connectionString:validateTestDatabase(env), max:2, connectionTimeoutMillis:3000});
}
export async function requireTestDatabase(env: Readonly<Record<string, string | undefined>> = process.env) {
  const pool=createTestPool(env);
  try {await pool.query("SELECT 1");} catch {throw new Error("Dedicated PostgreSQL test database is unavailable; credentials are not logged");} finally {await pool.end();}
}
