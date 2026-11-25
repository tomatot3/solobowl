import {expect,it} from "vitest";
import {isolatedSchema} from "../support/isolated-schema";
import {createAuthService} from "../../src/server/auth/service";
import {loadMigrations,runMigrations} from "../../src/server/db/migrate";
import {requireAccountSession} from "../../src/server/http/access";
import {createProfileService} from "../../src/server/profile/service";
import {createSyncService} from "../../src/server/sync/service";

it("registers without mail and restores the same account data in a second session", async () => {
  const db = await isolatedSchema();
  try {
    await runMigrations(db.pool,await loadMigrations());
    const origin = "http://127.0.0.1:3000";
    const secret = "test-only-username-secret-1234567890";
    const service = createAuthService({pool:db.pool,baseUrl:origin,secret,loginMode:"username"});
    const username = "new_diner";
    const password = "test username password";
    const post = (action:string,body:object) => service.handle(new Request(origin,{
      method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(body),
    }),action);
    const credentials = {username,password};
    expect((await post("register",credentials)).status).toBe(201);
    expect((await post("register",{...credentials,username:"NEW_DINER"})).status).toBe(409);
    expect((await post("login",{...credentials,password:"wrong password"})).status).toBe(401);
    expect((await post("password/reset-request",{email:"test@example.invalid"})).status).toBe(404);

    async function signIn(name:string) {
      const response = await post("login",{username:name,password});
      expect(response.status).toBe(200);
      const cookie = response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
      const request = new Request(origin,{headers:{cookie}});
      expect((await (await service.handle(request,"session")).json()).data.emailVerified).toBe(false);
      return requireAccountSession(request,service.resolveSession);
    }

    const first = await signIn(username);
    const profiles = createProfileService(db.pool);
    const grant = await profiles.grant(first.id,"preferences");
    await profiles.save(first.id,"preferences",{
      baseRevision:0,deletionGeneration:0,consentRef:grant.id,values:{preferredMinutes:25},
    });
    const second = await signIn("NEW_DINER");
    expect(second.id).toBe(first.id);
    const synced = await createSyncService(db.pool,secret).bootstrap(second.id);
    expect(synced.profile.sections.preferences?.values.preferredMinutes).toBe(25);
  } finally {
    await db.close();
  }
});
