import { beforeAll } from "vitest";
import { requireTestDatabase } from "./test-database";
beforeAll(async()=>{await requireTestDatabase();},10000);
