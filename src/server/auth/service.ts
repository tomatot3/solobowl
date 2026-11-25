import {createHash, randomBytes} from "node:crypto";
import {betterAuth} from "better-auth";
import type pg from "pg";
import {z} from "zod";
import {accountId} from "../../domain/shared/validation";
import {assertJsonMutation, assertSafeWrite, type SessionResolver} from "../http/access";
import {ApiError, failure, success} from "../http/envelope";
import type {MailSender} from "./mail";
import {identitySchemaOptions} from "./schema-options";

const EMAIL_LINK_SECONDS = 30 * 60;
const password = z.string().min(12).max(128);
const email = z.email().max(254).transform(value => value.toLowerCase());
const token = z.string().min(20).max(128).regex(/^[A-Za-z0-9_-]+$/);
const login = z.object({email, password: z.string().min(1).max(128)}).strict();
const registration = z.object({email, password}).strict();
const address = z.object({email}).strict();
const verification = z.object({token}).strict();
const reset = z.object({token, newPassword: password}).strict();

function verificationKey(value: string) {
  return "email-confirm:" + createHash("sha256").update(value).digest("hex");
}

export function createAuthService({pool, baseUrl, secret, mail}: {
  pool: pg.Pool; baseUrl: string; secret: string; mail?: MailSender;
}) {
  const origin = new URL(baseUrl).origin;
  const basePath = "/api/v1/auth";
  const attempts = new Map<string, number>();
  let resetAt = 0;
  function limit(action: string, key?: string) {
    const now = Date.now();
    if (now >= resetAt) {
      attempts.clear();
      resetAt = now + 60000;
    }
    function count(id: string, max: number) {
      const next = (attempts.get(id) ?? 0) + 1;
      if (next > max) throw new ApiError("RATE_LIMITED");
      attempts.set(id, next);
    }
    count(action, 60);
    if (key) count(action + ":" + createHash("sha256").update(key).digest("hex"), 5);
  }

  function requireMail() {
    if (!mail) throw new ApiError("MAIL_UNAVAILABLE");
    return mail;
  }

  async function sendVerification(user: {id: string; email: string}) {
    const send = requireMail();
    const value = randomBytes(32).toString("base64url");
    await pool.query('INSERT INTO verification(identifier,value,"expiresAt") VALUES($1,$2,now()+$3*interval \'1 second\')',
      [verificationKey(value), user.id, EMAIL_LINK_SECONDS]);
    const link = new URL("/account/verify", origin);
    link.hash = new URLSearchParams({token: value}).toString();
    await send({kind: "verify", to: user.email, link: link.href});
  }

  const auth = betterAuth({
    ...identitySchemaOptions,
    database: pool,
    baseURL: origin,
    basePath,
    secret,
    trustedOrigins: [origin],
    logger: {disabled: true},
    rateLimit: {enabled: true, window: 60, max: 60},
    emailVerification: {sendOnSignUp: true, sendOnSignIn: false, sendVerificationEmail: ({user}) => sendVerification(user)},
    emailAndPassword: {
      ...identitySchemaOptions.emailAndPassword,
      autoSignIn: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: EMAIL_LINK_SECONDS,
      revokeSessionsOnPasswordReset: true,
      async sendResetPassword({user, token}) {
        const link = new URL("/account/reset-password", origin);
        link.hash = new URLSearchParams({token}).toString();
        await requireMail()({kind: "reset", to: user.email, link: link.href});
      },
    },
  });

  const resolveSession: SessionResolver = async request => {
    const session = await auth.api.getSession({headers: request.headers, query: {disableRefresh: true}});
    if (!session) return null;
    return {
      accountId: accountId(session.user.id),
      emailVerified: session.user.emailVerified,
      expiresAt: session.session.expiresAt,
    };
  };

  async function confirmEmail(value: string) {
    const result = await pool.query(
      `WITH redeemed AS (
         DELETE FROM verification WHERE identifier=$1 AND "expiresAt">now()
         RETURNING value
       )
       UPDATE "user" SET "emailVerified"=true,"updatedAt"=now()
       FROM redeemed WHERE id::text=redeemed.value AND NOT "emailVerified"
       RETURNING id`,
      [verificationKey(value)],
    );
    if (!result.rowCount) throw new ApiError("INVALID_AUTH_TOKEN");
  }

  function delegate(request: Request, path: string, body?: object, forwardCookie = false) {
    const headers = new Headers({origin, "content-type": "application/json"});
    const cookie = request.headers.get("cookie");
    if (forwardCookie && cookie) headers.set("cookie", cookie);
    return auth.handler(new Request(origin + basePath + path, {
      method: "POST", headers, body: JSON.stringify(body ?? {}),
    }));
  }

  async function process(request: Request, action: string): Promise<Response> {
    if (action === "session" && request.method === "GET") {
      const session = await resolveSession(request);
      if (!session) throw new ApiError("AUTH_REQUIRED");
      return success({userId: session.accountId, emailVerified: session.emailVerified, sessionExpiry: session.expiresAt});
    }
    if (request.method !== "POST") throw new ApiError("RESOURCE_NOT_FOUND");
    assertSafeWrite(request, origin);
    const text = await request.text();
    if (action !== "logout" || text) assertJsonMutation(request);
    if (text.length > 4096) throw new ApiError("INVALID_INPUT");
    let input: unknown;
    try { input = action === "logout" && !text ? {} : JSON.parse(text); }
    catch { throw new ApiError("INVALID_INPUT"); }
    async function output(response: Response | Promise<Response>, code?: "INVALID_CREDENTIALS" | "INVALID_AUTH_TOKEN") {
      const result = await response;
      if (result.ok) return result;
      if (result.status === 429) throw new ApiError("RATE_LIMITED");
      if (result.status >= 500) throw new ApiError("NOT_READY");
      if (code) throw new ApiError(code);
      throw new ApiError("INVALID_INPUT");
    }
    switch (action) {
      case "register": {
        const values = registration.parse(input);
        limit(action, values.email);
        requireMail();
        await output(delegate(request, "/sign-up/email", {...values, name: "新食友"}));
        return success({status: "verification_required"}, undefined, 202);
      }
      case "login": {
        const values = login.parse(input);
        limit(action, values.email);
        const result = await output(delegate(request, "/sign-in/email", values), "INVALID_CREDENTIALS");
        const body = await result.json();
        const cookies = result.headers.getSetCookie();
        const cookie = cookies.map(value => value.split(";")[0]).join("; ");
        if (!body.user?.emailVerified || !cookie) throw new ApiError("INVALID_CREDENTIALS");
        const session = await resolveSession(new Request(origin, {headers: {cookie}}));
        if (!session?.emailVerified) throw new ApiError("NOT_READY");
        const response = success({userId: session.accountId, emailVerified: true, sessionExpiry: session.expiresAt});
        for (const value of cookies) response.headers.append("set-cookie", value);
        return response;
      }
      case "verification/request":
      case "password/reset-request": {
        const values = address.parse(input);
        limit(action, values.email);
        requireMail();
        const path = action === "verification/request" ? "/send-verification-email" : "/request-password-reset";
        await output(delegate(request, path, values));
        return success({status: "generic_ack"}, undefined, 202);
      }
      case "verification/confirm":
        limit(action);
        await confirmEmail(verification.parse(input).token);
        return success({status: "verified"});
      case "password/reset-confirm":
        limit(action);
        await output(delegate(request, "/reset-password", reset.parse(input)), "INVALID_AUTH_TOKEN");
        return success({status: "reset"});
      case "logout": {
        z.object({}).strict().parse(input);
        const expected = request.headers.get("x-profile-account");
        if (expected && (await resolveSession(request))?.accountId !== expected) throw new ApiError("REVISION_CONFLICT");
        const result = await output(delegate(request, "/sign-out", {}, true));
        const response = new Response(null, {status: 204, headers: {"Cache-Control": "no-store"}});
        for (const value of result.headers.getSetCookie()) response.headers.append("set-cookie", value);
        return response;
      }
      default:
        throw new ApiError("RESOURCE_NOT_FOUND");
    }
  }
  return {
    resolveSession,
    async handle(request: Request, action: string) {
      try { return await process(request, action); }
      catch (error) { return failure(error instanceof z.ZodError ? new ApiError("INVALID_INPUT") : error); }
    },
  };
}
