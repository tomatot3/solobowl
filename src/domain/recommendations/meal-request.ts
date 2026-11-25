import {z} from "zod";
const text=z.string().trim().min(1).max(48);
const ids=z.array(text).max(20).transform(values=>[...new Set(values)]);
const minutes=z.number().int().min(1).max(1440);

export const mealRequestInput=z.object({
  dishName:text.optional(), ingredientIds:ids.optional(), ingredientName:text.optional(),
  flavorIds:ids.optional(), preferredMinutes:minutes.optional(), maxMinutes:minutes.optional(),
  difficulty:text.optional(), equipmentIds:ids.optional(),
}).strict();

export type MealRequest=z.infer<typeof mealRequestInput>;
export function hasMealCondition(request:MealRequest) {
  return Object.values(request).some(value=>Array.isArray(value)?value.length>0:value!==undefined);
}

export function recipeText(value:string) {
  return value.trim().normalize("NFKC").toLocaleLowerCase("zh-CN");
}

export function recipeMatchesText(value:string,query:string) {
  return recipeText(value).includes(recipeText(query));
}
