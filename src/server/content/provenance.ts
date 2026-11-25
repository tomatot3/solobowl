import type {RecipeVersion} from "../../domain/recipes/types";

export function validateProvenance(version:RecipeVersion){
  const sources=new Map(version.sources.map(source=>[source.id,source]));
  if(sources.size!==version.sources.length||version.sources.some(source=>source.versionId!==version.id
    ||!source.citation.trim()||!/^[a-f0-9]{64}$/.test(source.sourceHash)))throw new Error("INVALID_SOURCE_EVIDENCE");
  for(const review of version.reviews){
    const source=review.evidenceId&&sources.get(review.evidenceId);
    if((review.scope==="sources"||review.evidenceId!==null)&&!source)throw new Error("INVALID_SOURCE_REVIEW_LINK");
  }
  for(const source of version.sources){
    if(source.sourceType==="modern_advice"&&!source.evidenceLevel?.trim())throw new Error("EVIDENCE_LEVEL_REQUIRED");
    if(source.directoryVersion!==null&&!source.directoryVersion.trim())throw new Error("DIRECTORY_VERSION_REQUIRED");
  }
}
