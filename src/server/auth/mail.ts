import {randomUUID} from "node:crypto";
import {mkdir, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {ApiError} from "../http/envelope";

export type AccountMail = {kind: "verify" | "reset"; to: string; link: string};
export type MailSender = (message: AccountMail) => Promise<void>;

export function localMailSender(transport: string, runtime: string, baseUrl: string): MailSender | undefined {
  if (transport !== "capture" || runtime === "production") return;
  if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(baseUrl).hostname)) return;
  return async message => {
    try {
      const inbox = resolve(".cache/auth-mail");
      await mkdir(inbox, {recursive: true});
      await writeFile(resolve(inbox, randomUUID() + ".json"), JSON.stringify(message), {flag: "wx", mode: 0o600});
    } catch {
      throw new ApiError("MAIL_UNAVAILABLE");
    }
  };
}
