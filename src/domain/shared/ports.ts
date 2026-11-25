import type {AccountId,EntityId,Owner,Revision} from "./types";
import type {RecipeCandidate,EligibilityContext,ExclusionReason} from "../recommendations/eligibility";
import type {RecipeLifecycle} from "../recipes/types";
export interface ContentPort{
 listCurrentWinter():Promise<readonly RecipeCandidate[]>;
 getVersion(id:EntityId):Promise<RecipeCandidate|null>;
}
export type CurrentContext={kind:"guest"}|{kind:"account";accountId:AccountId};
export interface ContextPort{resolve():Promise<CurrentContext>}
export interface AuthorizationPort{isAuthorized(context:CurrentContext,purpose:"safety"|"preferences"|"ai"):Promise<boolean>}
export interface SafetyPort{readConfirmed(context:CurrentContext):Promise<EligibilityContext>;hasUnresolvedConflict(context:CurrentContext):Promise<boolean>}
export interface LifecyclePort{readLatest(versionId:EntityId):Promise<RecipeLifecycle|null>}
export interface LoggerPort{excluded(versionId:EntityId,reason:ExclusionReason):void;clearSubject(subjectRef:AccountId):Promise<void>}
export type SyncResource="profile"|"consent"|"today_state"|"favorite"|"task"|"shopping"|"timer"|"progress"|"completion";
export type SyncMutation={operationId:EntityId;resource:SyncResource;entityId:EntityId;baseRevision:Revision;deletionGeneration:number;payload:Readonly<Record<string,unknown>>};
export interface SyncAdapter{
 /** Must authorize and validate inside the transaction; no generic table bypass. */
 apply(context:Extract<Owner,{kind:"account"}>,mutation:SyncMutation):Promise<{entityId:EntityId;revision:Revision}>;
}
export class PortUnavailableError extends Error{readonly code="NOT_READY";constructor(){super("ADAPTER_UNAVAILABLE");this.name="PortUnavailableError";}}
export function requireSyncAdapter(registry:ReadonlyMap<SyncResource,SyncAdapter>,resource:SyncResource):SyncAdapter{
 const adapter=registry.get(resource);if(!adapter)throw new PortUnavailableError();return adapter;
}
