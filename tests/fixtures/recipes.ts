import {createHash} from "node:crypto";
import type {Recipe,RecipeVersion,RecipeLifecycle,LifecycleState} from "../../src/domain/recipes/types";
import {entityId,revision,utcInstant} from "../../src/domain/shared/validation";
export type RecipeFixture={recipe:Recipe;version:RecipeVersion;lifecycle:RecipeLifecycle};
export function fixtureId(n:number){return entityId(`00000000-0000-4000-8000-${n.toString(16).padStart(12,"0")}`);}
/** Synthetic test content and reviewer labels; never a real content review. */
export function recipeFixture(index=1,state:LifecycleState="published",overrides:Partial<RecipeVersion>={}):RecipeFixture{
 const base=index*100;const rid=fixtureId(base),vid=fixtureId(base+1),lineId=fixtureId(base+2),stepId=fixtureId(base+3),optionId=fixtureId(base+4),evidenceId=fixtureId(base+5),reviewId=fixtureId(base+7);
 const version:RecipeVersion={id:vid,recipeId:rid,internalRevision:revision(1),rawVersion:"test-v1",sourceHash:"a".repeat(64),contentHash:"",name:`TEST ONLY ${index}`,image:null,prepMinutes:"5",cookMinutes:"10",totalMinutes:"15",difficulty:"easy",equipment:["pot"],season:"winter",termCodes:["lidong"],tags:[],dishType:"soup",completeness:"1",allergenIds:[],allergensReviewed:true,restrictionIds:[],
  ingredients:[{id:lineId,versionId:vid,order:1,ingredientId:"test-ingredient",rawName:"TEST ONLY",role:"main",amount:{kind:"numeric",quantity:"100",unit:"g"},optional:false,shoppingIncluded:true}],
  steps:[{id:stepId,versionId:vid,order:1,instruction:"TEST ONLY",ingredientLineIds:[lineId],heat:null,durationSeconds:null,timerStartCue:null,completionCue:null,safetyNotice:"TEST ONLY"}],
  sources:[{id:evidenceId,versionId:vid,sourceType:"adaptation",citation:"ISOLATED TEST FIXTURE - NOT REAL SOURCE",evidenceLevel:null,directoryVersion:null,sourceLocation:null,sourceHash:"a".repeat(64)}],
  reviews:(["content","servings","steps","sources","dictionary","safety"] as const).map((scope,i)=>({id:fixtureId(base+6+i),versionId:vid,scope,status:"approved",reviewer:"TEST ONLY - NOT PROFESSIONAL REVIEW",reviewedAt:utcInstant("2026-11-24T00:00:00Z"),evidenceId})),
  servingOptions:[{id:optionId,versionId:vid,servings:"1",reviewRef:reviewId,ingredientQuantities:[{ingredientLineId:lineId,quantity:"100",unit:"g",quantityText:null}],stepOverrides:[]},{id:fixtureId(base+12),versionId:vid,servings:"2",reviewRef:reviewId,ingredientQuantities:[{ingredientLineId:lineId,quantity:"180",unit:"g",quantityText:null}],stepOverrides:[]}],...overrides};
 const hashed={...version,contentHash:""};const complete={...version,contentHash:createHash("sha256").update(JSON.stringify(hashed)).digest("hex")};
 return {recipe:{id:rid,sourceId:`TEST_ONLY_${index}`,currentPublishedVersionId:state==="published"?vid:null},version:complete,lifecycle:{versionId:vid,state,revision:revision(0),changedAt:utcInstant("2026-11-24T00:00:00Z"),withdrawalReason:state==="safety_withdrawn"?"TEST ONLY PUBLIC NOTICE":null}};
}
export const candidateScenarios=[[],[recipeFixture(1)],[recipeFixture(1),recipeFixture(2)],[recipeFixture(1),recipeFixture(2),recipeFixture(3),recipeFixture(4)]] as const;
export function seedRecipes():RecipeFixture[]{
 const current=recipeFixture(1,"published",{internalRevision:revision(2)});
 const previous=recipeFixture(6,"archived",{recipeId:current.recipe.id});previous.recipe={...current.recipe};
 return [current,recipeFixture(2),recipeFixture(3),recipeFixture(4,"draft"),recipeFixture(5,"published",{cookMinutes:null,totalMinutes:null}),previous,recipeFixture(7,"safety_withdrawn")];
}
export const invalidRecipes={missingSteps:recipeFixture(20,"draft",{steps:[]}),noncontinuousStep:recipeFixture(21,"draft",{steps:[{...recipeFixture(21).version.steps[0]!,order:2}]}),missingAllergens:recipeFixture(22,"published",{allergenIds:null,allergensReviewed:false})};
