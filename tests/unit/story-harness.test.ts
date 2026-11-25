import {describe,it,expect} from "vitest";
import {createStoryHarness} from "../support/story-harness";
import {recipeFixture,fixtureId} from "../fixtures/recipes";
import {accountId} from "../../src/domain/shared/validation";
describe("explicit story test doubles",()=>{
 it("isolates fake sessions and injects time without an HTTP date override",async()=>{
  const harness=createStoryHarness({now:new Date("2026-12-31T15:59:59Z"),recipes:[recipeFixture()]});
  const cookie=harness.sessionCookie(accountId(fixtureId(8001)));const request=new Request("http://test.invalid",{headers:{cookie}});
  expect((await harness.resolveSession(request))?.emailVerified).toBe(true);expect(harness.clock.businessDate()).toBe("2026-12-31");
  expect(await createStoryHarness().resolveSession(request)).toBeNull();harness.advanceBy(2000);expect(harness.clock.businessDate()).toBe("2027-01-01");
 });
 it("returns copies and changes lifecycle only when the test explicitly asks",async()=>{
  const fixture=recipeFixture();const harness=createStoryHarness({recipes:[fixture]});
  const first=await harness.content.getVersion(fixture.version.id);expect(first?.version.name).toBe("TEST ONLY 1");
  (first!.version as unknown as {name:string}).name="modified";expect((await harness.content.getVersion(fixture.version.id))?.version.name).toBe("TEST ONLY 1");
  harness.setLifecycle(fixture.version.id,"safety_withdrawn");expect(await harness.content.listCurrentWinter()).toEqual([]);expect((await harness.lifecycle.readLatest(fixture.version.id))?.state).toBe("safety_withdrawn");
 });
});
