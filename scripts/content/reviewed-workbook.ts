import { randomUUID } from "node:crypto";
import { decimalSource, isCookingWater, referencedOrdinals, workbookAmount, workbookStepTime, type StagedRecipe } from "../../src/domain/content/normalize";
import type { DictionaryOption } from "../../src/domain/content/dictionary";
import { WINTER_TERMS, type IngredientLine, type RecipeVersion, type ReviewScope, type WinterTerm } from "../../src/domain/recipes/types";
import { entityId, revision, utcInstant } from "../../src/domain/shared/validation";

const termNames = ["立冬", "小雪", "大雪", "冬至", "小寒", "大寒"];
const scopes: ReviewScope[] = ["content", "servings", "steps", "sources", "dictionary", "safety"];
const roles = { 主料: "main", 辅料: "secondary", 调味料: "seasoning" } as const;
const difficulties = { 简单: "easy", 中等: "medium", 复杂: "hard", 困难: "hard" } as const;
const sourceTypes = { 改编: "adaptation", 原创: "original" } as const;
const id = () => entityId(randomUUID());

const text = (value: unknown) => String(value ?? "").trim();
const optionalText = (value: unknown) => {
  const result = text(value);
  return result && result !== "—" ? result : null;
};
const labels = (value: unknown) => [...new Set(text(value).split(/[、,，;；]/).map(item => item.trim()).filter(Boolean))];

export function workbookDictionary(drafts: readonly StagedRecipe[]) {
  const entries = new Map<string, DictionaryOption>();
  const add = (kind: DictionaryOption["kind"], key: string, label: string) => {
    if (!entries.has(`${kind}:${key}`)) entries.set(`${kind}:${key}`, { kind, id: key, label });
  };
  const allergenNames = new Set(drafts.flatMap(draft => labels(draft.sources[0]?.cells.Q)));
  const ingredientAllergies = new Map<string, Set<string>>();

  for (const draft of drafts) {
    const row = draft.sources[0]!.cells;
    const flavor = optionalText(row.J);
    if (flavor && flavor !== "清单") add("flavor", flavor === "软烂" ? "soft" : flavor, flavor);
    for (const item of labels(row.N)) add("dietary", item, item);
    for (const item of labels(row.M)) add("region", item, item);
    for (const item of labels(row.R)) add("equipment", item, item);
    for (const ingredient of draft.ingredients) {
      const key = text(ingredient.cells.I);
      const name = text(ingredient.cells.D);
      if (!key || !name) throw new Error(`MISSING_INGREDIENT_ID:用料!I${ingredient.row}`);
      if (!isCookingWater(ingredient)) add("avoidances", key, name);
      const note = text(ingredient.cells.H);
      const declared = ingredientAllergies.get(key) ?? new Set<string>();
      for (const allergen of allergenNames) if (note.includes(allergen)) declared.add(allergen);
      if (["猪肉", "鸡肉"].includes(note)) declared.add(note);
      ingredientAllergies.set(key, declared);
    }
  }

  for (const name of new Set([...allergenNames, ...[...ingredientAllergies.values()].flatMap(items => [...items])])) {
    add("allergies", name, name);
  }
  return { options: [...entries.values()], ingredientAllergies };
}

export function reviewedRecipe(
  draft: StagedRecipe,
  sourceHash: string,
  recipeId: string | null,
  internalRevision: number,
  image: string,
  review: { reviewer: string; reviewedAt: string },
  ingredientAllergies: ReadonlyMap<string, ReadonlySet<string>>,
): RecipeVersion {
  const { row, cells } = draft.sources[0]!;
  if (cells.K !== "冬季" || !/^1\s*人份$/.test(text(cells.Z)) || ![cells.E, cells.F, cells.G, cells.H].every(value => value === "通过")) {
    throw new Error(`SOURCE_APPROVAL_MISMATCH:${draft.sourceId}`);
  }
  const versionId = id();
  const citation = optionalText(cells.AC);
  const sourceType = sourceTypes[text(cells.AD) as keyof typeof sourceTypes];
  const completeness = decimalSource(cells.AE);
  if (!citation || !sourceType || completeness === null) throw new Error(`INVALID_RECIPE_PROVENANCE:${draft.sourceId}`);
  const evidenceId = id();
  const termCodes = labels(cells.L).map(name => {
    const code = WINTER_TERMS[termNames.indexOf(name)];
    if (!code) throw new Error(`INVALID_WINTER_TERM:${draft.sourceId}`);
    return code as WinterTerm;
  });
  const reviews = scopes.map(scope => ({ id: id(), versionId, scope, status: "approved" as const,
    reviewer: review.reviewer, reviewedAt: utcInstant(review.reviewedAt), evidenceId }));
  const ingredients = [...draft.ingredients].sort((a,b) => Number(a.cells.C) - Number(b.cells.C)).map(item => {
    const role = isCookingWater(item) ? "auxiliary_water" : roles[text(item.cells.J) as keyof typeof roles];
    if (!role || !["是", "否"].includes(text(item.cells.K)) || !["是", "否"].includes(text(item.cells.M))) {
      throw new Error(`INVALID_INGREDIENT_FLAGS:用料!J${item.row}`);
    }
    return {
      id: id(), versionId, order: Number(item.cells.C), ingredientId: text(item.cells.I), rawName: text(item.cells.D),
      role, amount: workbookAmount(item), optional: item.cells.K === "否", shoppingIncluded: item.cells.M === "是",
    } satisfies IngredientLine;
  });
  const ingredientByOrder = new Map(ingredients.map(line => [line.order, line.id]));
  const steps = [...draft.steps].sort((a,b) => Number(a.cells.C) - Number(b.cells.C)).map(({ cells: step }) => {
    const time = workbookStepTime(step.H);
    const instruction = text(step.D);
    return {
      id: id(), versionId, order: Number(step.C),
      instruction: time.note && !instruction.includes(time.note) ? `${instruction.replace(/。$/, "")}（参考时长 ${time.note}）。` : instruction,
      ingredientLineIds: [...new Set(referencedOrdinals(step.E))].map(order => ingredientByOrder.get(order)!),
      heat: optionalText(step.F), durationSeconds: time.seconds, timerStartCue: optionalText(step.G),
      completionCue: optionalText(step.I), safetyNotice: optionalText(step.L),
    };
  });
  const allergens = new Set(labels(cells.Q));
  for (const ingredient of ingredients) {
    for (const name of ingredientAllergies.get(ingredient.ingredientId) ?? []) allergens.add(name);
  }
  if (allergens.has("鱼类")) allergens.add("海鲜");
  const flavor = optionalText(cells.J);
  const tags = [...labels(cells.P), ...labels(cells.N).map(label => `dietary:${label}`), ...labels(cells.M).map(label => `region:${label}`)];
  if (flavor && flavor !== "清单") tags.push(`flavor:${flavor === "软烂" ? "soft" : flavor}`);

  return {
    id: versionId, recipeId: recipeId === null ? id() : entityId(recipeId), internalRevision: revision(internalRevision),
    rawVersion: draft.rawVersion, sourceHash, contentHash: "", name: text(cells.B), image,
    prepMinutes: draft.prep, cookMinutes: draft.cook, totalMinutes: draft.total,
    difficulty: difficulties[text(cells.W) as keyof typeof difficulties] ?? null, equipment: labels(cells.R),
    season: "winter", termCodes, tags, dishType: optionalText(cells.I), completeness,
    allergenIds: [...allergens], allergensReviewed: true, restrictionIds: [], ingredients, steps,
    servingOptions: [{
      id: id(), versionId, servings: "1", reviewRef: reviews.find(item => item.scope === "servings")!.id,
      ingredientQuantities: ingredients.map(({ id: ingredientLineId, amount }) => ({
        ingredientLineId, quantity: amount.kind === "numeric" ? amount.quantity : null,
        unit: amount.kind === "numeric" ? amount.unit : null, quantityText: amount.kind === "text" ? amount.text : null,
      })), stepOverrides: [],
    }],
    sources: [{ id: evidenceId, versionId, sourceType, citation, evidenceLevel: null, directoryVersion: null,
      sourceLocation: `菜谱!AC${row}`, sourceHash }], reviews,
  };
}
