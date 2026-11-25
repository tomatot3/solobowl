import {systemClock} from "../../../../domain/calendar/clock";
import {getDatabasePool} from "../../../../server/db/connection";
import {readSeasonContext} from "../../../../server/calendar/repository";
import {createSeasonHandler} from "../../../../server/calendar/handler";
export const dynamic="force-dynamic";
export const GET=createSeasonHandler(systemClock,now=>readSeasonContext(getDatabasePool(),now));
