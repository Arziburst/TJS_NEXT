// A stand-in for the Vercel AI Gateway's language-model endpoint (POST <base>/language-model, the wire format
// of @ai-sdk/gateway: the call options in, a LanguageModelV4 generate result out). It "translates" by prefixing
// every source text with the target locale ("[de] …"), so tests can tell each locale's text apart. Playwright
// starts it for the e2e run; in local dev run `node e2e/ai-gateway-mock.ts` and point AI_GATEWAY_BASE_URL at
// it (docs/dev-environment.md). No real model is called, nothing is billed.
//
// A source title containing "[omit:<locale>]" leaves that locale out of the answer (a partial failure).
import { createServer } from "node:http";

const port = Number(process.env.AI_GATEWAY_MOCK_PORT || 4500);
// the key the app must send; anything else gets the gateway's 401
const apiKey = process.env.AI_GATEWAY_MOCK_KEY || "e2e-gateway-key";

type Part = { type: string; text?: string };
type Message = { role: string; content: string | Part[] };

function promptText(messages: Message[]): string {
  return messages
    .filter((m) => m.role === "user")
    .flatMap((m) => (typeof m.content === "string" ? [m.content] : m.content.map((p) => p.text ?? "")))
    .join("\n");
}

function translate(value: unknown, locale: string): unknown {
  if (typeof value === "string") return `[${locale}] ${value}`;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, translate(inner, locale)]));
  }
  return value;
}

function answer(prompt: string): string {
  const targets = [...(/^Target locales: (.*)$/m.exec(prompt)?.[1] ?? "").matchAll(/\b([a-z]{2}) \(/g)].map((m) => m[1]);
  const source = JSON.parse(prompt.slice(prompt.indexOf("{", prompt.indexOf("Source texts (JSON):")))) as {
    title?: string;
  };
  const omitted = [...(source.title ?? "").matchAll(/\[omit:([a-z]{2})\]/g)].map((m) => m[1]);
  const translations = Object.fromEntries(
    targets.filter((locale) => !omitted.includes(locale)).map((locale) => [locale, translate(source, locale)]),
  );
  return JSON.stringify({ translations });
}

const server = createServer((request, response) => {
  const send = (status: number, body: unknown) => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
  };
  const path = new URL(request.url ?? "/", `http://127.0.0.1:${port}`).pathname;
  if (path === "/health") return send(200, { ok: true });
  if (request.headers.authorization !== `Bearer ${apiKey}`) {
    return send(401, { error: { message: "Invalid API key", type: "authentication_error" } });
  }
  if (request.method !== "POST" || !path.endsWith("/language-model")) {
    return send(404, { error: { message: "not found", type: "not_found_error" } });
  }

  let body = "";
  request.on("data", (chunk) => (body += chunk));
  request.on("end", () => {
    try {
      const options = JSON.parse(body) as { prompt: Message[] };
      const text = answer(promptText(options.prompt));
      send(200, {
        content: [{ type: "text", text }],
        finishReason: { unified: "stop", raw: "end_turn" },
        usage: {
          inputTokens: { total: Math.ceil(body.length / 4), noCache: Math.ceil(body.length / 4) },
          outputTokens: { total: Math.ceil(text.length / 4), text: Math.ceil(text.length / 4) },
        },
        warnings: [],
      });
    } catch (error) {
      send(400, { error: { message: String(error), type: "invalid_request_error" } });
    }
  });
});

server.listen(port, "127.0.0.1", () => console.log(`AI Gateway mock on http://127.0.0.1:${port}/v4/ai`));
