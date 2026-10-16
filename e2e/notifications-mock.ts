// A stand-in for the Telegram Bot API (sendMessage) and the Resend API (POST /emails) that keeps what it got, so
// the e2e tests can check the messages of a placed order. Playwright starts it for the e2e run and points the app
// at it (playwright.config.ts); nothing reaches a real chat or inbox.
//   GET /health            ready check
//   GET /sent?number=10001 { telegram: [{ chatId, text, parseMode }], email: [{ to, subject, html, text, idempotencyKey }] }
//   GET /sent?to=a@b.test  { telegram: [], email: [...] } every email to that address (Auth's emails through the
//                          Send Email Hook, #99, when the stack runs with it)
import { createServer } from "node:http";

const port = Number(process.env.NOTIFICATIONS_MOCK_PORT || 4100);
const botToken = process.env.NOTIFICATIONS_MOCK_BOT_TOKEN || "e2e-bot-token";
const apiKey = process.env.NOTIFICATIONS_MOCK_API_KEY || "e2e-resend-key";

type Telegram = { chatId: string; text: string; parseMode: string };
type Email = { to: string[]; subject: string; html: string; text: string; idempotencyKey: string | null };

const telegram: Telegram[] = [];
const email: Email[] = [];

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  const send = (status: number, body: unknown) => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
  };

  if (request.method === "GET" && url.pathname === "/health") return send(200, { ok: true });
  if (request.method === "GET" && url.pathname === "/sent") {
    const to = url.searchParams.get("to");
    if (to) return send(200, { telegram: [], email: email.filter((message) => message.to.includes(to)) });
    const number = url.searchParams.get("number") ?? "";
    // an Auth email's token hash could contain the digits of an order number
    const orderEmails = email.filter((message) => !message.idempotencyKey?.startsWith("auth-email/"));
    return send(200, {
      telegram: telegram.filter((message) => message.text.includes(`№ ${number}`)),
      email: orderEmails.filter((message) => message.text.includes(number)),
    });
  }

  let raw = "";
  request.on("data", (chunk: Buffer) => (raw += chunk.toString("utf8")));
  request.on("end", () => {
    const body = raw ? JSON.parse(raw) : {};
    if (request.method === "POST" && url.pathname === `/bot${botToken}/sendMessage`) {
      telegram.push({ chatId: String(body.chat_id), text: body.text, parseMode: body.parse_mode });
      return send(200, { ok: true, result: { message_id: telegram.length } });
    }
    if (request.method === "POST" && url.pathname.startsWith("/bot")) {
      return send(401, { ok: false, error_code: 401, description: "Unauthorized" });
    }
    if (request.method === "POST" && url.pathname === "/emails") {
      if (request.headers.authorization !== `Bearer ${apiKey}`) return send(401, { name: "validation_error", message: "API key is invalid" });
      const idempotencyKey = request.headers["idempotency-key"];
      email.push({ to: body.to, subject: body.subject, html: body.html, text: body.text, idempotencyKey: typeof idempotencyKey === "string" ? idempotencyKey : null });
      return send(200, { id: `email-${email.length}` });
    }
    send(404, { error: "not found" });
  });
});

server.listen(port, "127.0.0.1", () => console.log(`notifications mock on http://127.0.0.1:${port}`));
