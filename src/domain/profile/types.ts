export type RestrictionSelection =
  | {state: "unknown" | "explicit_none"; ids: readonly []}
  | {state: "provided"; ids: readonly string[]};

export type SafetyProfile = {
  allergies: RestrictionSelection;
  avoidances: RestrictionSelection;
  professionalRestrictions: RestrictionSelection;
};

export type ConsentPurpose = "safety" | "preferences" | "ai";
export type ProfileConsent = {purpose: ConsentPurpose; noticeVersion: string; acceptedAt: string; revokedAt: string | null};
export type Preferences = {flavorIds: readonly string[]; dietaryIds: readonly string[]; regionIds: readonly string[]; preferredMinutes: number | null; difficulty: string | null};

export function restrictionSelection(
  state: RestrictionSelection["state"],
  ids: readonly string[],
  approvedIds: ReadonlySet<string>,
): RestrictionSelection {
  const normalized = [...new Set(ids)];
  if (normalized.some(id => !approvedIds.has(id))) throw new Error("UNKNOWN_RESTRICTION");
  if (state === "provided") {
    if (!normalized.length) throw new Error("MISSING_RESTRICTION");
    return {state, ids: normalized};
  }
  if (normalized.length) throw new Error("UNEXPECTED_RESTRICTION");
  return {state, ids: []};
}

export function hasActiveConsent(consent: ProfileConsent | null, purpose: ConsentPurpose): boolean {
  return consent?.purpose === purpose && consent.revokedAt === null;
}

export function recommendationProfile(profile: {
  safety: SafetyProfile | null;
  preferences: Preferences | null;
  safetyConsent: ProfileConsent | null;
  preferenceConsent: ProfileConsent | null;
}): {safety: SafetyProfile | null; preferences: Preferences | null} {
  const preferences = profile.preferences;
  const hasPreferences = preferences && (
    preferences.flavorIds.length || preferences.dietaryIds.length || preferences.regionIds.length ||
    preferences.preferredMinutes !== null || preferences.difficulty !== null
  );
  return {
    safety: hasActiveConsent(profile.safetyConsent, "safety") ? profile.safety : null,
    preferences: hasPreferences && hasActiveConsent(profile.preferenceConsent, "preferences") ? preferences : null,
  };
}
