import { z } from "zod";
import { aiApiKey, readConfig } from "../config";
import { ProviderError, reasonReplySchema, type Provider } from "./enhance";

const instructions = "Return JSON only with items [{recipeId,versionId,role,reasonFactors}]. Keep every candidate and role. Select only nonempty reasonFactors supported for that candidate. Do not add claims or fields.";
const openAiSchema = z.toJSONSchema(reasonReplySchema, { target: "draft-7" });
delete openAiSchema.$schema;

const completedOpenAiResponse = z.object({
  status: z.literal("completed"),
  output: z.array(z.object({
    type: z.string(),
    content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
  })),
});

async function postModelRequest(url: string, key: string, body: object, signal: AbortSignal) {
  const response = await fetch(url, {
    method: "POST", signal, redirect: "error",
    headers: { authorization: "Bearer " + key, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const header = response.headers.get("retry-after");
    const delay = header && /^\d+$/.test(header) ? Number(header) * 1000 : header ? Date.parse(header) - Date.now() : NaN;
    throw new ProviderError(response.status, Number.isFinite(delay) ? Math.max(0, delay) : undefined);
  }
  return response.json();
}

export function productionProvider(config = readConfig()): Provider | undefined {
  const key = aiApiKey(config);
  const model = config.AI_MODEL;
  if (config.AI_MODE !== "live" || config.AI_PROCESSING_APPROVED !== "true" || !key || !model || !config.AI_NOTICE_URL) return;

  if (config.AI_PROVIDER === "openai") {
    return async (input, signal) => {
      const body = await postModelRequest("https://api.openai.com/v1/responses", key, {
        model,
        instructions,
        input: JSON.stringify(input),
        max_output_tokens: 400,
        store: false,
        text: { format: { type: "json_schema", name: "recommendation_reasons", strict: true, schema: openAiSchema } },
      }, signal);
      const result = completedOpenAiResponse.safeParse(body);
      if (!result.success) return { text: "", finishReason: null };

      const content = result.data.output.flatMap(item => item.type === "message" ? item.content ?? [] : []);
      if (content.some(part => part.type === "refusal")) return { text: "", finishReason: null };
      const text = content.filter(part => part.type === "output_text").map(part => part.text).join("");
      return { text, finishReason: "stop" };
    };
  }

  return async (input, signal) => {
    const body = await postModelRequest("https://api.deepseek.com/chat/completions", key, {
      model, thinking: { type: "disabled" }, temperature: 0, max_tokens: 400, stream: false,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: JSON.stringify(input) },
      ],
    }, signal);
    const first = body.choices?.[0];
    return { text: typeof first?.message?.content === "string" ? first.message.content : "", finishReason: first?.finish_reason ?? null };
  };
}
