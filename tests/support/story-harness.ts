import type {AccountId,EntityId} from "../../src/domain/shared/types";
import {nextRevision,utcInstant} from "../../src/domain/shared/validation";
import {createClock} from "../../src/domain/calendar/clock";
import type {ContentPort,LifecyclePort} from "../../src/domain/shared/ports";
import type {RecipeCandidate} from "../../src/domain/recommendations/eligibility";
import {filterEligible} from "../../src/domain/recommendations/eligibility";
import type {LifecycleState} from "../../src/domain/recipes/types";
import type {SessionResolver,TrustedSession} from "../../src/server/http/access";
/** TEST DOUBLES ONLY. Does not authenticate real users, access a network or prove
 * cross-device synchronization. Real database tests use isolatedSchema instead. */
export function createStoryHarness(options:{now?:Date;recipes?:readonly RecipeCandidate[]}={}){
 let time=(options.now??new Date("2026-11-24T00:00:00Z")).getTime();if(!Number.isFinite(time))throw new Error("INVALID_TEST_CLOCK");
 const clock=createClock(()=>new Date(time));
 const recipes=new Map((options.recipes??[]).map(f=>[f.version.id,structuredClone(f)]));
 const sessions=new Map<string,TrustedSession>();let sequence=0;
 const resolveSession:SessionResolver=async request=>{
  const cookie=request.headers.get("cookie")?.split(";").map(s=>s.trim()).find(s=>s.startsWith("test-session="));
  const session=cookie?sessions.get(cookie.slice("test-session=".length)):undefined;
  return session&&session.expiresAt.getTime()>time?structuredClone(session):null;
 };
 const content:ContentPort={
  async listCurrentWinter(){return structuredClone(filterEligible([...recipes.values()],{allergenIds:[],avoidedIngredientIds:[],restrictionIds:[],equipment:{status:"unknown"},maxMinutes:null,safetyConflict:false}).eligible);},
  async getVersion(id){return structuredClone(recipes.get(id)??null);},
 };
 const lifecycle:LifecyclePort={async readLatest(id){return structuredClone(recipes.get(id)?.lifecycle??null);}};
 return {
  clock,content,lifecycle,resolveSession,
  advanceBy(milliseconds:number){if(!Number.isSafeInteger(milliseconds)||milliseconds<0||!Number.isFinite(new Date(time+milliseconds).getTime()))throw new Error("INVALID_TEST_CLOCK_ADVANCE");time+=milliseconds;},
  sessionCookie(id:AccountId,emailVerified=true,ttlMs=3600000){if(!Number.isSafeInteger(ttlMs)||ttlMs<=0)throw new Error("INVALID_TEST_SESSION_TTL");const token=`TEST_ONLY_${++sequence}`;sessions.set(token,{accountId:id,emailVerified,expiresAt:new Date(time+ttlMs)});return `test-session=${token}`;},
  setLifecycle(id:EntityId,state:LifecycleState){
   const existing=recipes.get(id);if(!existing)throw new Error("TEST_RECIPE_NOT_FOUND");
   recipes.set(id,{...existing,recipe:{...existing.recipe,currentPublishedVersionId:state==="published"?id:null},lifecycle:{...existing.lifecycle,state,revision:nextRevision(existing.lifecycle.revision),changedAt:utcInstant(clock.now().toISOString())}});
  },
 };
}
