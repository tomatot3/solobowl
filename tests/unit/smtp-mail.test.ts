import {beforeEach,expect,it,vi} from "vitest";
import {readConfig} from "../../src/server/config";
import {smtpMailSender} from "../../src/server/auth/smtp";

const transport=vi.hoisted(()=>({send:vi.fn(),create:vi.fn()}));
vi.mock("nodemailer",()=>({default:{createTransport:transport.create}}));

const env={MAIL_TRANSPORT:"smtp",SMTP_HOST:"mail.example.invalid",SMTP_FROM:"sender@example.invalid",SMTP_USER:"test-user",SMTP_PASSWORD:"test-only-value"};
const recipient="tester@example.invalid";
const message={kind:"verify" as const,to:recipient,link:"https://app.example.invalid/account/verify#token=fixture"};

beforeEach(()=>{
  transport.send.mockReset();
  transport.create.mockReset().mockReturnValue({sendMail:transport.send});
});

it("requires approved SMTP configuration and encrypted delivery options",async()=>{
  expect(()=>readConfig(env)).toThrow("approved processing notice");
  expect(()=>readConfig({MAIL_TRANSPORT:"smtp",SMTP_PROCESSING_APPROVED:"true"})).toThrow("SMTP_HOST");
  expect(transport.create).not.toHaveBeenCalled();
  const sender=smtpMailSender(readConfig({...env,SMTP_PROCESSING_APPROVED:"true"}));
  expect(transport.create).toHaveBeenCalledWith(expect.objectContaining({secure:false,requireTLS:true,port:587,disableFileAccess:true,disableUrlAccess:true}));
  transport.send.mockResolvedValue({accepted:[recipient],rejected:[]});
  await sender(message);
  expect(transport.send).toHaveBeenCalledWith(expect.objectContaining({from:"sender@example.invalid",to:recipient,subject:expect.stringContaining("验证邮箱"),text:expect.stringContaining(message.link)}));
});

it("uses implicit TLS when configured and converts provider errors to a safe mail status",async()=>{
  const sender=smtpMailSender(readConfig({...env,SMTP_TLS:"implicit",SMTP_PORT:"465",SMTP_PROCESSING_APPROVED:"true"}));
  expect(transport.create).toHaveBeenCalledWith(expect.objectContaining({secure:true,port:465}));
  transport.send.mockRejectedValueOnce(new Error("provider returned private response"));
  await expect(sender({...message,kind:"reset"})).rejects.toMatchObject({code:"MAIL_UNAVAILABLE"});
  expect(transport.send).toHaveBeenCalledWith(expect.objectContaining({subject:expect.stringContaining("重置密码")}));
  transport.send.mockResolvedValueOnce({accepted:[],rejected:[recipient]});
  await expect(sender(message)).rejects.toMatchObject({code:"MAIL_UNAVAILABLE"});
});
