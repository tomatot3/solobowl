import {emptyProfile, grantForEdit, normalizeSection, NOTICE_VERSION, preferenceValues, removedProfileValues, type Grant, type Profile, type Purpose} from "../../domain/profile/sections";
import {openGuestStore} from "./guest";
import {discardPendingSection, pushOperation} from "../sync/engine";
import {optionSets,type DictionaryOption} from "../../domain/content/dictionary";

export type LoadedProfile = {kind: "guest"; profile: Profile} | {kind: "account"; accountId: string; profile: Profile};
class ProfileRequestError extends Error {
  constructor(readonly status: number, message: string) {super(message);}
}

async function request<T>(route: string, method = "GET", body?: object, accountId?: string): Promise<T> {
  const headers = new Headers();
  if (body) headers.set("content-type","application/json");
  if (accountId) headers.set("x-profile-account",accountId);
  const response = await fetch("/api/v1/" + route,{
    method,cache:"no-store",headers,body:body ? JSON.stringify(body) : undefined,
  });
  const value = await response.json();
  if (!response.ok) throw new ProfileRequestError(response.status,value.error?.message ?? "资料操作未完成");
  return value.data;
}

async function guestUpdate(change: (profile: Profile) => Profile): Promise<Profile> {
  const store = openGuestStore();
  try { return (await store.update<Profile>("profile","current", value => change(value ?? emptyProfile())))!; }
  finally {store.close();}
}

async function guestRead(): Promise<Profile> {
  if (!localStorage.getItem("shiyoushu:guest-id")) return emptyProfile();
  const store = openGuestStore();
  try {return (await store.get<Profile>("profile","current")) ?? emptyProfile();}
  finally {store.close();}
}

export async function loadProfile(): Promise<LoadedProfile> {
  try {
    const {accountId,...profile} = await request<Profile & {accountId:string}>("profile");
    return {kind:"account",accountId,profile};
  }
  catch (error) {
    if (!(error instanceof ProfileRequestError) || error.status !== 401) throw error;
    return {kind:"guest", profile:await guestRead()};
  }
}

function currentStamp(profile: Profile, section: Purpose) {
  const old = profile.sections[section];
  return {baseRevision:old?.revision??0,deletionGeneration:old?.deletionGeneration??0};
}

export async function saveProfileSection(current: LoadedProfile, section: Purpose, values: Record<string,unknown>, accepted: boolean, options:DictionaryOption[] = []) {
  const stamp = currentStamp(current.profile,section);
  const existing = grantForEdit(current.profile,section);
  const next = normalizeSection(section,values,optionSets(options));
  if (next.state === "unknown") return deleteProfileSection(current,section);
  if (!existing && !accepted) throw new Error("请先确认这项资料的用途");

  if (current.kind === "account") {
    const grant = existing ?? await request<Grant>("consents","POST",{purpose:section,noticeVersion:NOTICE_VERSION,accepted:true},current.accountId);
    await pushOperation(current.accountId,{...stamp,entityId:section,entityType:"profile",action:"save",patch:{values,consentRef:grant.id}});
    return {...current,profile:await request<Profile>("profile","GET",undefined,current.accountId)};
  }
  const profile = await guestUpdate(latest => {
    assertLocalCurrent(latest,section,stamp);
    const grant = grantForEdit(latest,section);
    if (!grant && !accepted) throw new Error("请重新确认授权");
    const consent = grant ?? {id:crypto.randomUUID(),purpose:section,noticeVersion:NOTICE_VERSION,revision:1,deletionGeneration:stamp.deletionGeneration};
    const removed=removedProfileValues(latest.sections[section]?.values??{},next.values);
    return {
      consents:[...latest.consents.filter(record => record.purpose !== section),consent],
      sections:{...latest.sections,[section]:{...next,consentRef:consent.id,revision:stamp.baseRevision+1,deletionGeneration:stamp.deletionGeneration+Number(removed)}},
    };
  });
  return {kind:"guest" as const,profile};
}

export async function discoveryGuestContext(){
  const current=await loadProfile();
  if(current.kind!=="guest")return undefined;
  const profile=current.profile;
  const safety=profile.sections.safety;
  const consents=(purpose:Purpose,id:string|null|undefined)=>profile.consents.some(grant=>grant.purpose===purpose&&grant.id===id&&grant.noticeVersion===NOTICE_VERSION);
  function ids(field:string){
    const value=safety?.values[field] as {state?:string;ids?:string[]}|undefined;
    return value?.state==="provided"?value.ids??[]:[];
  }
  const time=profile.sections.preferences;
  const preferences=preferenceValues.safeParse(time?.values);
  return {
    safety:consents("safety",safety?.consentRef)?{consent:true as const,allergenIds:ids("allergies"),avoidedIngredientIds:ids("avoidances"),restrictionIds:ids("professionalRestrictions")}:undefined,
    preferences:consents("preferences",time?.consentRef)&&preferences.success?{...preferences.data,consent:true as const}:undefined,
  };
}

function assertLocalCurrent(latest: Profile, section: Purpose, expected: ReturnType<typeof currentStamp>) {
  const stamp = currentStamp(latest,section);
  if (stamp.baseRevision !== expected.baseRevision || stamp.deletionGeneration !== expected.deletionGeneration) {
    throw new Error("记录已更新，请重新打开后再试");
  }
}

export async function deleteProfileSection(current: LoadedProfile,section: Purpose) {
  const stamp = currentStamp(current.profile,section);
  if (current.kind === "account") {
    await discardPendingSection(current.accountId,section);
    await pushOperation(current.accountId,{...stamp,entityId:section,entityType:"profile",action:"delete",patch:{item:"all"}});
    return {...current,profile:await request<Profile>("profile","GET",undefined,current.accountId)};
  }
  const profile = await guestUpdate(latest => {
    assertLocalCurrent(latest,section,stamp);
    return {
      consents:latest.consents.filter(grant=>grant.purpose!==section),
      sections:{...latest.sections,[section]:{state:"unknown",values:{},consentRef:null,revision:stamp.baseRevision+1,deletionGeneration:stamp.deletionGeneration+1}},
    };
  });
  return {kind:"guest" as const,profile};
}

export async function revokeProfileConsent(current: LoadedProfile, grant: Grant) {
  if (current.kind === "account") {
    await request("consents/"+grant.id,"DELETE",{baseRevision:grant.revision},current.accountId);
    await discardPendingSection(current.accountId,grant.purpose);
    return {...current,profile:await request<Profile>("profile","GET",undefined,current.accountId)};
  }
  const profile = await guestUpdate(latest => ({...latest,consents:latest.consents.filter(item=>item.id!==grant.id)}));
  return {kind:"guest" as const,profile};
}
