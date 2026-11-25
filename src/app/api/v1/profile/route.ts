import {profileHttp} from "@/server/profile/http";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => profileHttp(request,"profile",[]);
