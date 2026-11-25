import AuthForm from "../AuthForm";
import {readConfig} from "@/server/config";

export const dynamic="force-dynamic";

export default function Page() {
  return <AuthForm mode="login" loginMode={readConfig().AUTH_LOGIN_MODE} />;
}
