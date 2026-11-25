import {expect,it} from "vitest";
import {isolatedSchema} from "../support/isolated-schema";
import {loadMigrations,runMigrations} from "../../src/server/db/migrate";
import {createAuthService} from "../../src/server/auth/service";
import type {AccountMail} from "../../src/server/auth/mail";

it("verifies once, signs in, and revokes the previous session after password reset", async () => {
  const db = await isolatedSchema();
  try {
    await runMigrations(db.pool,await loadMigrations());
    const mail: AccountMail[] = [];
    const origin = "http://127.0.0.1:3000";
    const settings = {pool:db.pool,baseUrl:origin,secret:"test-only-secret-1234567890-abcdef"};
    const service = createAuthService({...settings,mail:async message => {mail.push(message);}});
    const email = "auth-flow@example.invalid";
    const password = "first test password";
    const request = (body: object) => new Request(origin,{
      method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(body),
    });
    const post = (action: string,body: object) => service.handle(request(body),action);
    const session = (cookie: string) => service.handle(new Request(origin,{headers:{cookie}}),"session");
    function getToken(kind: AccountMail["kind"]) {
      const message = mail.findLast(item => item.kind === kind);
      expect(message?.to).toBe(email);
      return new URLSearchParams(new URL(message!.link).hash.slice(1)).get("token");
    }
    const noMail = createAuthService(settings);
    expect((await noMail.handle(request({email}),"password/reset-request")).status).toBe(503);
    expect((await noMail.handle(request({email,password}),"register")).status).toBe(503);
    expect((await db.pool.query('SELECT id FROM "user" WHERE email=$1',[email])).rowCount).toBe(0);
    const untrusted = new Request(origin,{
      method:"POST",headers:{origin:"https://untrusted.example.invalid","content-type":"application/json"},body:JSON.stringify({email,password}),
    });
    expect((await service.handle(untrusted,"register")).status).toBe(403);
    expect((await post("register",{email,password})).status).toBe(202);
    expect((await post("register",{email,password})).status).toBe(202);
    expect((await post("login",{email,password})).status).toBe(401);
    const verifyToken = getToken("verify");
    expect((await post("verification/confirm",{token:verifyToken})).status).toBe(200);
    expect((await post("verification/confirm",{token:verifyToken})).status).toBe(422);
    const login = await post("login",{email,password});
    expect(login.status).toBe(200);
    const cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    expect((await session(cookie)).status).toBe(200);
    const known = await post("password/reset-request",{email});
    const unknown = await post("password/reset-request",{email:"absent@example.invalid"});
    expect(known.status).toBe(202);
    expect((await known.json()).data).toEqual((await unknown.json()).data);
    const token = getToken("reset");
    expect((await post("password/reset-confirm",{token,newPassword:"second test password"})).status).toBe(200);
    expect((await post("password/reset-confirm",{token,newPassword:"third test password"})).status).toBe(422);
    expect((await session(cookie)).status).toBe(401);
    expect((await post("login",{email,password:"second test password"})).status).toBe(200);
  } finally {
    await db.close();
  }
});
