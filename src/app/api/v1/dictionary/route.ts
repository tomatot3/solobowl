import {getDatabasePool} from "@/server/db/connection";
import {reviewedDictionary} from "@/server/content/dictionary";
import {handleApi} from "@/server/http/envelope";

export const dynamic="force-dynamic";
export function GET(){return handleApi(()=>reviewedDictionary(getDatabasePool()));}
