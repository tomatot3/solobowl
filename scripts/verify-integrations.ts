import {existsSync} from "node:fs";
import {readConfig} from "../src/server/config";

if(existsSync(".env.local"))process.loadEnvFile(".env.local");

const env=process.env;
let validConfiguration=true;
try{readConfig(env);}catch{validConfiguration=false;}
const missingSmtp=["SMTP_HOST","SMTP_FROM","SMTP_USER","SMTP_PASSWORD"].filter(key=>!env[key]||/change_me|placeholder/i.test(env[key]!));
const checks={
  validConfiguration,
  email:{
    localCapture:(env.MAIL_TRANSPORT??"capture")==="capture"&&env.NODE_ENV!=="production",
    liveDelivery:"not-executed",
    missing:[
      ...(env.MAIL_TRANSPORT==="smtp"?[]:["MAIL_TRANSPORT=smtp"]),
      ...missingSmtp,
      ...(env.SMTP_PROCESSING_APPROVED==="true"?[]:["approved-mail-processing-notice"]),
      "authorized-test-recipient",
    ],
  },
  model:{
    liveCall:"not-executed",
    missing:[
      ...(env.AI_MODE==="live"?[]:["AI_MODE=live"]),
      ...(env.AI_MODEL?[]:["AI_MODEL"]),
      ...(env.AI_NOTICE_URL?[]:["AI_NOTICE_URL"]),
      ...(env.DEEPSEEK_API_KEY&&!/change_me|placeholder/i.test(env.DEEPSEEK_API_KEY)?[]:["DEEPSEEK_API_KEY"]),
      ...(env.AI_PROCESSING_APPROVED==="true"?[]:["approved-processing-notice"]),
    ],
  },
};

console.log(JSON.stringify(checks,null,2));
