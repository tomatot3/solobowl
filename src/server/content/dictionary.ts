import type pg from "pg";
import {optionSets,type DictionaryOption} from "../../domain/content/dictionary";

export async function reviewedDictionary(client:Pick<pg.Pool,"query">|Pick<pg.PoolClient,"query">){
  return (await client.query<DictionaryOption>(`SELECT kind,canonical_id AS id,label FROM reviewed_dictionary
    WHERE approved_at<=now() ORDER BY kind,label,canonical_id`)).rows;
}
export async function approvedProfileOptions(client:Pick<pg.Pool,"query">|Pick<pg.PoolClient,"query">){
  return optionSets(await reviewedDictionary(client));
}
