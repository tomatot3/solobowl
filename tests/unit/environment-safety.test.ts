import { describe,it,expect } from "vitest";
import { readConfig } from "../../src/server/config";
import { validateTestDatabase } from "../support/test-database";
const testUrl="postgresql://test:secret@127.0.0.1:5432/shiyoushu_test";
describe("configuration and database isolation boundaries",()=>{
 it("defaults to disabled AI without making network calls",()=>{expect(readConfig({}).AI_MODE).toBe("disabled");});
 it("requires both a key and processing approval for live AI",()=>{expect(()=>readConfig({AI_MODE:"live",DEEPSEEK_API_KEY:"test-key"})).toThrow("approved");expect(()=>readConfig({AI_MODE:"live",AI_PROCESSING_APPROVED:"true"})).toThrow("configured");});
 it("does not leak invalid configuration values",()=>{expect(()=>readConfig({DATABASE_URL:"do-not-print-secret"})).toThrow("DATABASE_URL");try{readConfig({DATABASE_URL:"do-not-print-secret"});}catch(e){expect(String(e)).not.toContain("do-not-print-secret");}});
 it("rejects production mocks or capture transport",()=>{expect(()=>readConfig({NODE_ENV:"production",APP_BASE_URL:"https://test.invalid",AUTH_SECRET:"x".repeat(40),AI_MODE:"mock",MAIL_TRANSPORT:"disabled"})).toThrow("cannot use");});
 it("rejects missing test database configuration",()=>{expect(()=>validateTestDatabase({})).toThrow("required");});
 it("rejects any destructive test operation in production",()=>{expect(()=>validateTestDatabase({NODE_ENV:"production",TEST_DATABASE_URL:testUrl})).toThrow("forbidden");});
 it("rejects a remote database even when named as a test",()=>{expect(()=>validateTestDatabase({TEST_DATABASE_URL:"postgresql://test:secret@db.invalid/shiyoushu_test"})).toThrow("loopback");});
 it("rejects a database without the dedicated test suffix",()=>{expect(()=>validateTestDatabase({TEST_DATABASE_URL:"postgresql://test:secret@localhost/shiyoushu_dev"})).toThrow("_test");});
 it("rejects the development database with different credentials",()=>{expect(()=>validateTestDatabase({TEST_DATABASE_URL:testUrl,DATABASE_URL:"postgresql://other:other@127.0.0.1/shiyoushu_test"})).toThrow("development");});
 it("rejects a loopback alias of the development database",()=>{expect(()=>validateTestDatabase({TEST_DATABASE_URL:testUrl,DATABASE_URL:"postgresql://test:secret@localhost/shiyoushu_test"})).toThrow("development");});
 it("rejects a URL-encoded alias of the development database",()=>{expect(()=>validateTestDatabase({TEST_DATABASE_URL:"postgresql://test:secret@localhost/%73hiyoushu_test",DATABASE_URL:testUrl})).toThrow("development");});
 it("rejects non-HTTP application origins",()=>{expect(()=>readConfig({APP_BASE_URL:"file:///private/example"})).toThrow("APP_BASE_URL");});
 it("accepts a distinct dedicated local test database",()=>{expect(validateTestDatabase({TEST_DATABASE_URL:testUrl,DATABASE_URL:"postgresql://dev:secret@127.0.0.1/shiyoushu_dev"})).toBe(testUrl);});
});
