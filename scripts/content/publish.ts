import {readFile} from "node:fs/promises";
import {createDatabasePool} from "../../src/server/db/pool";
import {publishReviewed,publicationInput} from "../../src/server/content/publish";
import {changeLifecycle,lifecycleInput} from "../../src/server/content/lifecycle";
import {loadReviewConfig,reviewConfig} from "../../src/server/content/review-config";

async function main(){
  const [action,path]=process.argv.slice(2);
  if(!path||!["publish","lifecycle","review-config"].includes(action??""))throw new Error("PUBLISH_LIFECYCLE_OR_REVIEW_CONFIG_REQUIRED");
  process.loadEnvFile(".env.local");
  const url=process.env.DATABASE_URL;
  if(!url||process.env.NODE_ENV==="production")throw new Error("LOCAL_DEVELOPMENT_DATABASE_REQUIRED");
  const target=new URL(url);
  if(!["localhost","127.0.0.1","[::1]"].includes(target.hostname)||!decodeURIComponent(target.pathname).endsWith("_dev"))throw new Error("LOCAL_DEVELOPMENT_DATABASE_REQUIRED");
  const value:unknown=JSON.parse((await readFile(path,"utf8")).replace(/^\uFEFF/,""));
  const pool=createDatabasePool(url);
  try{
    const result=action==="publish"?await publishReviewed(pool,publicationInput.parse(value))
      :action==="lifecycle"?await changeLifecycle(pool,lifecycleInput.parse(value)):await loadReviewConfig(pool,reviewConfig.parse(value));
    console.log(JSON.stringify(result));
  }finally{await pool.end();}
}
main().catch(error=>{const message=error instanceof Error?error.message:"";console.error(/^[A-Z_]+$/.test(message)?message:"CONTENT_OPERATION_FAILED");process.exitCode=1;});
