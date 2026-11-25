import "server-only";
import {readConfig} from "../config";
import {getDatabasePool} from "../db/connection";
import {ApiError} from "../http/envelope";
import {localMailSender} from "./mail";
import {smtpMailSender} from "./smtp";
import {createAuthService} from "./service";

const globals = globalThis as typeof globalThis & {shiyoushuAuth?: ReturnType<typeof createAuthService>};
export function getAuthService() {
  if (!globals.shiyoushuAuth) {
    const config = readConfig();
    if (!config.AUTH_SECRET || config.AUTH_SECRET.length < 32) throw new ApiError("NOT_READY");
    globals.shiyoushuAuth = createAuthService({
      pool: getDatabasePool(), baseUrl: config.APP_BASE_URL, secret: config.AUTH_SECRET,
      loginMode: config.AUTH_LOGIN_MODE,
      mail: config.MAIL_TRANSPORT==="smtp"?smtpMailSender(config):localMailSender(config.MAIL_TRANSPORT,config.NODE_ENV,config.APP_BASE_URL),
    });
  }
  return globals.shiyoushuAuth;
}
