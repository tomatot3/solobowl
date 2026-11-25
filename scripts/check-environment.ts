import { readConfig } from "../src/server/config";
try {
  if (process.versions.node.split(".")[0] !== "24") throw new Error("This project is pinned to Node.js 24 LTS; see .node-version");
  const c=readConfig();
  console.log(JSON.stringify({node:process.versions.node,configuration:"valid",database:c.DATABASE_URL?"configured-not-connected":"not-configured",testDatabase:c.TEST_DATABASE_URL?"configured-not-connected":"not-configured",mail:c.MAIL_TRANSPORT,ai:c.AI_MODE},null,2));
} catch (error) { console.error(error instanceof Error?error.message:"Environment validation failed"); process.exitCode=1; }
