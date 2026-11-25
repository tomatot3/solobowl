import {z} from "zod";
import type {DictionaryKind} from "../content/dictionary";

export const NOTICE_VERSION = "p0-profile-v1";
export const safetyFields = ["avoidances", "allergies", "professionalRestrictions"] as const;
export type SafetyField = typeof safetyFields[number];
export type Section = "safety" | "preferences" | "equipment";
export type Purpose = "safety" | "preferences";
export type Stamp = {revision: number; deletionGeneration: number};
export type ProfileSection = Stamp & {
  state: "unknown" | "explicit_none" | "provided";
  values: Record<string, unknown>;
  consentRef: string | null;
};
export type Grant = {id: string; purpose: Purpose; noticeVersion: string; revision: number; deletionGeneration?:number};

export function grantForEdit(profile:Profile,purpose:Purpose){
  return profile.consents.find(grant=>grant.purpose===purpose&&grant.noticeVersion===NOTICE_VERSION
    &&(grant.deletionGeneration??0)===(profile.sections[purpose]?.deletionGeneration??0));
}
export type Profile = {sections: Partial<Record<Section, ProfileSection>>; consents: Grant[]};
export const emptyProfile = (): Profile => ({sections: {}, consents: []});
export function removedProfileValues(before:Record<string,unknown>,after:Record<string,unknown>){
  function ids(value:unknown):unknown[]{
    if(Array.isArray(value))return value;
    if(value!==null&&typeof value==="object"&&"ids" in value&&Array.isArray(value.ids))return value.ids;
    return [];
  }
  return Object.keys(before).some(key=>!Object.hasOwn(after,key)||ids(before[key]).some(value=>!ids(after[key]).includes(value)));
}
export const stamp = z.object({baseRevision: z.number().int().min(0).max(2147483646), deletionGeneration: z.number().int().min(0).max(2147483646)});
export const sectionName = z.enum(["safety", "preferences", "equipment"]);
export const consentInput = z.object({purpose: z.enum(["safety", "preferences"]), noticeVersion: z.literal(NOTICE_VERSION), accepted: z.literal(true)}).strict();
export const patchInput = stamp.extend({values: z.unknown(), consentRef: z.uuid().optional()}).strict();
const ids = z.array(z.string().min(1).max(100)).max(50);
const restriction = z.discriminatedUnion("state", [
  z.object({state: z.literal("unknown"), ids: z.tuple([])}).strict(),
  z.object({state: z.literal("explicit_none"), ids: z.tuple([])}).strict(),
  z.object({state: z.literal("provided"), ids: ids.min(1)}).strict(),
]);
const safety = z.object({
  avoidances: restriction.optional(), allergies: restriction.optional(), professionalRestrictions: restriction.optional(),
}).strict();
export const preferenceValues = z.object({
  preferredMinutes: z.number().int().min(1).max(1440).nullable().optional(),
  flavorIds:ids.optional(),dietaryIds:ids.optional(),regionIds:ids.optional(),
  difficulty:z.enum(["easy","medium","hard"]).optional(),
}).strict();
const equipment = z.object({availableIds: ids}).strict();

export function normalizeSection(section: Section, raw: unknown, approved: Partial<Record<DictionaryKind, ReadonlySet<string>>> = {}) {
  if (section === "preferences") {
    const input=preferenceValues.parse(raw);
    const values:Record<string,unknown>={};
    if(input.preferredMinutes)values.preferredMinutes=input.preferredMinutes;
    if(input.difficulty)values.difficulty=input.difficulty;
    for(const kind of ["flavor","dietary","region"] as const){
      const key=kind==="flavor"?"flavorIds":kind==="dietary"?"dietaryIds":"regionIds";
      const labels=[...new Set(input[key]??[])];
      if(labels.some(id=>!approved[kind]?.has(id)))throw new Error("UNKNOWN_PROFILE_OPTION");
      if(labels.length)values[key]=labels;
    }
    return {state:Object.keys(values).length?"provided":"unknown",values} as const;
  }
  if (section === "equipment") {
    const values = equipment.parse(raw);
    if (values.availableIds.some(id => !approved.equipment?.has(id))) throw new Error("UNKNOWN_PROFILE_OPTION");
    return {state: values.availableIds.length ? "provided" : "explicit_none", values: {availableIds: [...new Set(values.availableIds)]}} as const;
  }
  const selections = safety.parse(raw);
  const values: Record<string, unknown> = {};
  let provided = false;
  for (const field of safetyFields) {
    const entry = selections[field];
    if (!entry || entry.state === "unknown") continue;
    if (entry.ids.some(id => !approved[field]?.has(id))) throw new Error("UNKNOWN_PROFILE_OPTION");
    values[field] = {...entry, ids: [...new Set(entry.ids)]};
    provided ||= entry.state === "provided";
  }
  const state = provided ? "provided" : Object.keys(values).length ? "explicit_none" : "unknown";
  return {state, values} as const;
}
