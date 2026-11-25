import nodemailer from "nodemailer";
import type {AppConfig} from "../config";
import {ApiError} from "../http/envelope";
import type {MailSender} from "./mail";

export function smtpMailSender(config:AppConfig):MailSender {
  const secure=config.SMTP_TLS==="implicit";
  const transporter=nodemailer.createTransport({
    host:config.SMTP_HOST, port:config.SMTP_PORT, secure, requireTLS:!secure,
    auth:{user:config.SMTP_USER!,pass:config.SMTP_PASSWORD!},
    connectionTimeout:8000,greetingTimeout:5000,socketTimeout:10000,dnsTimeout:5000,
    disableFileAccess:true,disableUrlAccess:true,
  });
  return async ({kind,to,link})=>{
    const action=kind==="verify"?"验证邮箱":"重置密码";
    try {
      const result=await transporter.sendMail({
        from:config.SMTP_FROM,to,subject:`食有数 · ${action}`,
        text:`请打开链接${action}。链接有效期为 30 分钟。\n\n${link}\n\n如果你没有发起此请求，可忽略这封邮件。`,
      });
      if(result.accepted.length!==1||result.rejected.length)throw new Error("SMTP did not accept the recipient");
    }catch{
      throw new ApiError("MAIL_UNAVAILABLE");
    }
  };
}
