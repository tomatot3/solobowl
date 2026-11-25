import AuthForm from "../AuthForm";
import {redirect} from "next/navigation";
import {readConfig} from "@/server/config";

export const dynamic="force-dynamic";

export default function Page() {
  const loginMode=readConfig().AUTH_LOGIN_MODE;
  if(loginMode==="username")redirect("/account/login");
  return <AuthForm mode="reset-password" loginMode={loginMode} />;
}
