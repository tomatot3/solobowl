export const dictionaryKinds=["avoidances","allergies","professionalRestrictions","equipment","flavor","dietary","region"] as const;
export type DictionaryKind=typeof dictionaryKinds[number];
export type DictionaryOption={kind:DictionaryKind;id:string;label:string};
export function optionSets(rows:readonly DictionaryOption[]){
  return Object.fromEntries(dictionaryKinds.map(kind=>[kind,new Set(rows.filter(row=>row.kind===kind).map(row=>row.id))]));
}
