import {Decimal} from "decimal.js";
import type {RecipeCandidate} from "./eligibility";
export type ScoredCandidate={candidate:RecipeCandidate;score:Decimal};
export function compareCandidates(a:ScoredCandidate,b:ScoredCandidate):number{
 const score=b.score.comparedTo(a.score);if(score)return score;
 const completeness=new Decimal(b.candidate.version.completeness).comparedTo(a.candidate.version.completeness);if(completeness)return completeness;
 const left=a.candidate.version.totalMinutes,right=b.candidate.version.totalMinutes;
 if(left===null&&right!==null)return 1;if(left!==null&&right===null)return -1;
 if(left!==null&&right!==null){const duration=new Decimal(left).comparedTo(right);if(duration)return duration;}
 const leftId=a.candidate.recipe.id,rightId=b.candidate.recipe.id;return leftId<rightId?-1:leftId>rightId?1:0;
}
export function selectRecommendations<T extends ScoredCandidate>(candidates:readonly T[]):(T&{role:"primary"|"alternative"})[]{
 const seen=new Set<string>();
 for(const c of candidates){if(!c.score.isFinite()||c.score.lt(0)||c.score.gt(100)||seen.has(c.candidate.recipe.id))throw new Error("INVALID_SCORED_CANDIDATES");seen.add(c.candidate.recipe.id);}
 const remaining=[...candidates].sort(compareCandidates);const selected:(T&{role:"primary"|"alternative"})[]=[];const types=new Set<string>();
 while(remaining.length&&selected.length<3){
  const top=remaining[0]!;let index=0;
  if(selected.length){const diverse=remaining.findIndex(c=>top.score.minus(c.score).lte(5)&&!!c.candidate.version.dishType&&!types.has(c.candidate.version.dishType));if(diverse>=0)index=diverse;}
  const chosen=remaining.splice(index,1)[0]!;selected.push({...chosen,role:selected.length?"alternative":"primary"});if(chosen.candidate.version.dishType)types.add(chosen.candidate.version.dishType);
 }
 return selected;
}
