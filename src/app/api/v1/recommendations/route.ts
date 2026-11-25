import {systemClock} from "@/domain/calendar/clock";
import {getDatabasePool} from "@/server/db/connection";
import {readConfig} from "@/server/config";
import {readSeasonContext} from "@/server/calendar/repository";
import {createRecipeRepository} from "@/server/recipes/repository";
import {createRecommendationHandler} from "@/server/recommendations/service";
import {resolveAccess} from "@/server/recommendations/context";
import {productionProvider} from "@/server/ai/provider";
import {handleApi} from "@/server/http/envelope";
export const dynamic="force-dynamic";
export async function POST(request:Request){
 try{
  const pool=getDatabasePool();
  return await createRecommendationHandler({clock:systemClock,baseUrl:readConfig().APP_BASE_URL,content:createRecipeRepository(pool),season:now=>readSeasonContext(pool,now),resolveAccess,provider:productionProvider(),
    audit:async event=>{
      await pool.query(`INSERT INTO recommendation_run(run_id,rule_version,mode,calendar_version,candidate_versions,ai_status,fallback_code,calls,elapsed_ms)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[event.runId,event.ruleVersion,event.mode,event.calendarVersion,event.versions,event.ai.status,event.ai.fallbackCode,event.ai.calls,event.elapsed]);
    },
  })(request);
 }catch(error){return handleApi(async()=>{throw error;});}
}
