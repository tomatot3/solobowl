import {expect, it} from "vitest";
import {recommendationProfile, restrictionSelection, type ProfileConsent} from "../../src/domain/profile/types";

const dictionary = new Set(["fixture-allergen"]);

it("keeps missing, explicitly none, and supplied restrictions distinct", () => {
  expect(restrictionSelection("unknown", [], dictionary)).toEqual({state: "unknown", ids: []});
  expect(restrictionSelection("explicit_none", [], dictionary)).toEqual({state: "explicit_none", ids: []});
  expect(restrictionSelection("provided", ["fixture-allergen", "fixture-allergen"], dictionary))
    .toEqual({state: "provided", ids: ["fixture-allergen"]});
  expect(() => restrictionSelection("provided", [], dictionary)).toThrow("MISSING_RESTRICTION");
  expect(() => restrictionSelection("unknown", ["fixture-allergen"], dictionary)).toThrow("UNEXPECTED_RESTRICTION");
  expect(() => restrictionSelection("provided", ["unknown"], dictionary)).toThrow("UNKNOWN_RESTRICTION");
});

it("withdrawal stops using safety data without interpreting it as no restriction", () => {
  const unknown = restrictionSelection("unknown", [], dictionary);
  const safety = {allergies: restrictionSelection("provided", ["fixture-allergen"], dictionary), avoidances: unknown, professionalRestrictions: unknown};
  const consent: ProfileConsent = {purpose: "safety", noticeVersion: "test", acceptedAt: "2026-11-24T00:00:00Z", revokedAt: null};
  const profile = {safety, preferences: null, preferenceConsent: null, safetyConsent: consent};
  expect(recommendationProfile(profile).safety).toEqual(safety);
  expect(recommendationProfile({...profile, safetyConsent: {...consent, revokedAt: "2026-11-24T01:00:00Z"}}).safety).toBeNull();
  expect(recommendationProfile({...profile, safety: null}).safety).toBeNull();
});

it("only includes supplied ordinary preferences with separate consent and never projects daily text", () => {
  const preferences = {flavorIds: [], dietaryIds: [], regionIds: [], preferredMinutes: null, difficulty: null};
  const consent: ProfileConsent = {purpose: "preferences", noticeVersion: "test", acceptedAt: "2026-11-24T00:00:00Z", revokedAt: null};
  const profile = {safety: null, safetyConsent: null, preferences, preferenceConsent: consent, todayText: "Private note"};
  expect(recommendationProfile(profile)).toEqual({safety: null, preferences: null});
  const filled = {...profile, preferences: {...preferences, preferredMinutes: 30}};
  expect(recommendationProfile(filled)).toEqual({safety: null, preferences: filled.preferences});
  expect(recommendationProfile({...filled, preferenceConsent: {...consent, purpose:"safety"}}).preferences).toBeNull();
});
