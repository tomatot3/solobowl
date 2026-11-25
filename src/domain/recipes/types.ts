import type {EntityId,Revision,UTCInstant} from "../shared/types";
export const WINTER_TERMS=["lidong","xiaoxue","daxue","dongzhi","xiaohan","dahan"] as const;
export type WinterTerm=typeof WINTER_TERMS[number];
export type Season="spring"|"summer"|"autumn"|"winter";
export type DecimalText=string;
export type LifecycleState="draft"|"reviewed"|"published"|"archived"|"safety_withdrawn";
export type SourceType="original"|"adaptation"|"traditional_explanation"|"modern_advice";
export type ReviewScope="content"|"servings"|"steps"|"sources"|"dictionary"|"safety";
export type Review={readonly id:EntityId;readonly versionId:EntityId;readonly scope:ReviewScope;readonly status:"pending"|"approved"|"rejected";readonly reviewer:string|null;readonly reviewedAt:UTCInstant|null;readonly evidenceId:EntityId|null};
export type SourceEvidence={readonly id:EntityId;readonly versionId:EntityId;readonly sourceType:SourceType;readonly citation:string;readonly evidenceLevel:string|null;readonly directoryVersion:string|null;readonly sourceLocation:string|null;readonly sourceHash:string};
export type IngredientLine={readonly id:EntityId;readonly versionId:EntityId;readonly order:number;readonly ingredientId:string|null;readonly rawName:string;readonly role:"main"|"secondary"|"seasoning"|"auxiliary_water";readonly amount:{readonly kind:"numeric";readonly quantity:DecimalText;readonly unit:string|null}|{readonly kind:"text";readonly text:string}|{readonly kind:"unknown"};readonly optional:boolean;readonly shoppingIncluded:boolean};
export type Step={readonly id:EntityId;readonly versionId:EntityId;readonly order:number;readonly instruction:string;readonly ingredientLineIds:readonly EntityId[];readonly heat:string|null;readonly durationSeconds:number|null;readonly timerStartCue:string|null;readonly completionCue:string|null;readonly safetyNotice:string|null};
export type ServingQuantity={readonly ingredientLineId:EntityId;readonly quantity:DecimalText|null;readonly unit:string|null;readonly quantityText:string|null};
export type StepOverride={readonly stepId:EntityId;readonly durationSeconds:number|null;readonly heat:string|null};
export type ServingOption={readonly id:EntityId;readonly versionId:EntityId;readonly servings:DecimalText;readonly reviewRef:EntityId|null;readonly ingredientQuantities:readonly ServingQuantity[];readonly stepOverrides:readonly StepOverride[]};
/** 内容不可变；完整度0—1不等于发布。Unknown minutes stay null.
 * 每个选项有审核依据；无依据仅一人份；不按份数自动倍增时长。 */
export type RecipeVersion={
 readonly id:EntityId;readonly recipeId:EntityId;readonly internalRevision:Revision;readonly rawVersion:string;readonly sourceHash:string;readonly contentHash:string;
 readonly name:string;readonly image:string|null;readonly prepMinutes:DecimalText|null;readonly cookMinutes:DecimalText|null;readonly totalMinutes:DecimalText|null;
 readonly difficulty:string|null;readonly equipment:readonly string[]|null;readonly season:Season|null;readonly termCodes:readonly WinterTerm[];readonly tags:readonly string[];readonly dishType:string|null;readonly completeness:DecimalText;
 readonly allergenIds:readonly string[]|null;readonly allergensReviewed:boolean;readonly restrictionIds:readonly string[];
 readonly ingredients:readonly IngredientLine[];readonly steps:readonly Step[];readonly servingOptions:readonly ServingOption[];readonly sources:readonly SourceEvidence[];readonly reviews:readonly Review[];
};
export type Recipe={readonly id:EntityId;readonly sourceId:string;readonly currentPublishedVersionId:EntityId|null};
export type RecipeLifecycle={readonly versionId:EntityId;readonly state:LifecycleState;readonly revision:Revision;readonly changedAt:UTCInstant;readonly withdrawalReason:string|null};
export type CalendarPeriod={readonly id:EntityId;readonly calendarVersion:string;readonly termCode:string;readonly season:Season;readonly startDate:string;readonly endDate:string;readonly timezone:"Asia/Shanghai";readonly sourceRef:string;readonly reviewRef:string};
export type HouContent={readonly id:EntityId;readonly periodId:EntityId;readonly startDate:string;readonly endDate:string;readonly name:string;readonly text:string;readonly sourceRef:string;readonly reviewRef:string;readonly status:"pending"|"approved"};
