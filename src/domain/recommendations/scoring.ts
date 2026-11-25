import {Decimal} from "decimal.js";
import type {RecipeCandidate} from "./eligibility";
import type {WinterTerm} from "../recipes/types";
const ScoreDecimal=Decimal.clone({precision:40});
export function scoreSeasonal(candidate:RecipeCandidate,currentTerm:WinterTerm){
 const v=candidate.version;const completeness=new ScoreDecimal(v.completeness);
 if(!completeness.isFinite()||completeness.lt(0)||completeness.gt(1))throw new Error("INVALID_COMPLETENESS");
 const season=v.season==="winter"?100:0,term=v.termCodes.includes(currentTerm)?100:season?50:0;
 const completenessPoints=completeness.times(100);
 const score=new ScoreDecimal(term).times(50).plus(new ScoreDecimal(season).times(25)).plus(completenessPoints.times(10)).div(85);
 return {candidate,mode:"A" as const,score,factors:{term,season,completeness:completenessPoints.toString(),denominator:85}};
}
