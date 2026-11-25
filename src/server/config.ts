import { z } from "zod";
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().optional(), TEST_DATABASE_URL: z.string().optional(),
  APP_BASE_URL: z.url().refine(value=>["http:","https:"].includes(new URL(value).protocol)).default("http://127.0.0.1:3000"),
  AUTH_SECRET: z.string().optional(), MAIL_TRANSPORT: z.enum(["disabled","capture","smtp"]).default("capture"),
  SMTP_HOST: z.string().regex(/^[a-z0-9.-]+$/i).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_TLS: z.enum(["starttls","implicit"]).default("starttls"),
  SMTP_FROM: z.email().optional(), SMTP_USER: z.string().min(1).optional(), SMTP_PASSWORD: z.string().min(1).optional(),
  SMTP_PROCESSING_APPROVED: z.enum(["true","false"]).default("false"),
  AI_MODE: z.enum(["disabled","mock","live"]).default("disabled"),
  AI_MODEL: z.string().regex(/^[a-z0-9._-]{1,80}$/i).optional(),
  AI_NOTICE_URL: z.url().refine(value=>new URL(value).protocol==="https:").optional(),
  AI_PROCESSING_APPROVED: z.enum(["true","false"]).default("false"), DEEPSEEK_API_KEY: z.string().optional(),
});
export type AppConfig = z.infer<typeof schema>;
export function readConfig(env: Readonly<Record<string, string | undefined>> = process.env): AppConfig {
  const result = schema.safeParse(env);
  if (!result.success) throw new Error("Invalid configuration fields: " + result.error.issues.map(issue=>issue.path.join(".")).join(", "));
  const config = result.data;
  for (const key of ["DATABASE_URL","TEST_DATABASE_URL"] as const) {
    if (!config[key]) continue;
    try { const u=new URL(config[key]); if (!["postgres:","postgresql:"].includes(u.protocol) || !u.hostname || u.pathname.length<2) throw new Error(); }
    catch { throw new Error(key+" must be a PostgreSQL URL; its value is not logged"); }
  }
  if (config.NODE_ENV === "production") {
    if (new URL(config.APP_BASE_URL).protocol !== "https:") throw new Error("Production APP_BASE_URL requires HTTPS");
    if (!config.AUTH_SECRET || config.AUTH_SECRET.length < 32 || /change_me|placeholder/i.test(config.AUTH_SECRET)) throw new Error("Production AUTH_SECRET requires a non-placeholder secret of at least 32 characters");
    if (config.MAIL_TRANSPORT === "capture" || config.AI_MODE === "mock") throw new Error("Production cannot use capture mail or mock AI");
  }
  if (config.AI_MODE === "live" && (config.AI_PROCESSING_APPROVED !== "true" || !config.DEEPSEEK_API_KEY || /change_me|placeholder/i.test(config.DEEPSEEK_API_KEY))) throw new Error("Live AI requires approved processing notice and a configured server key");
  if(config.AI_MODE==="live"&&!config.AI_MODEL)throw new Error("Live AI requires AI_MODEL");
  if(config.AI_MODE==="live"&&!config.AI_NOTICE_URL)throw new Error("Live AI requires AI_NOTICE_URL");
  if(config.MAIL_TRANSPORT==="smtp"){
    if(config.SMTP_PROCESSING_APPROVED!=="true")throw new Error("SMTP requires approved processing notice");
    if(!config.SMTP_HOST||!config.SMTP_FROM||!config.SMTP_USER||!config.SMTP_PASSWORD||/change_me|placeholder/i.test(config.SMTP_PASSWORD)){
      throw new Error("SMTP requires SMTP_HOST, SMTP_FROM, SMTP_USER and SMTP_PASSWORD");
    }
  }
  return config;
}
