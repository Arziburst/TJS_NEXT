// A stand-in for api.novapost.com v1.0 that answers from the fixtures of tests/delivery/fixtures/nova-post
// (shaped after the public OpenAPI spec). Playwright starts it for the e2e run; in local dev run
// `node e2e/nova-post-mock.ts` and point NOVA_POST_API_URL at it (docs/dev-environment.md). No real
// Nova Post traffic, no personal data.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const port = Number(process.env.NOVA_POST_MOCK_PORT || 4000);
// the key the app must send; anything else gets the gateway's 404 for an unknown key
const apiKey = process.env.NOVA_POST_MOCK_KEY || "e2e-fixture-key";
const fixtures = new URL("../tests/delivery/fixtures/nova-post/", import.meta.url);
const tokenPrefix = "mock.";

function fixture(name: string): { items?: Array<{ name: string }> } & Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(`${name}.json`, fixtures), "utf8"));
}

function exists(name: string): boolean {
  try {
    readFileSync(new URL(`${name}.json`, fixtures));
    return true;
  } catch {
    return false;
  }
}

// A JWT shaped like the API's (unsigned): `exp` an hour ahead, so the client keeps it
function jwt(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  return `${tokenPrefix}${encode({ typ: "JWT", alg: "none" })}.${encode({ iss: "np-mock", iat: now, exp: now + 3600 })}.mock`;
}

function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ł/g, "l");
}

const SETTLEMENTS: Record<string, string> = { PL: "settlements-pl-wroc", DE: "settlements-de", FR: "settlements-fr" };
const CALCULATIONS: Record<string, string> = { PL: "calculation-pl-division", DE: "calculation-de-address", FR: "calculation-fr-address" };

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  const send = (status: number, body: unknown) => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
  };
  const path = url.pathname.replace(/^\/v\.1\.0/, "");

  if (path === "/health") return send(200, { ok: true });
  if (path === "/clients/authorization") {
    return url.searchParams.get("apiKey") === apiKey ? send(200, { jwt: jwt() }) : send(404, { errors: { errorMessage: "not_found" } });
  }
  if (!request.headers.authorization?.startsWith(tokenPrefix)) return send(401, { errors: { errorMessage: "Unauthenticated." } });

  if (request.method === "GET" && path === "/settlements") {
    const country = url.searchParams.get("countryCodes[]") ?? "";
    const text = fold(url.searchParams.get("textSearch") ?? "");
    const name = SETTLEMENTS[country];
    const data = name ? fixture(name) : { current_page: 1, last_page: 1, per_page: 20, total: 0, items: [] };
    const items = (data.items ?? []).filter((item) => fold(item.name).includes(text));
    return send(200, { ...data, total: items.length, items });
  }
  if (request.method === "GET" && path === "/divisions") {
    const name = `divisions-${(url.searchParams.get("countryCodes[]") ?? "").toLowerCase()}-${url.searchParams.get("settlementIds[]")}-page${url.searchParams.get("page") ?? "1"}`;
    return send(200, exists(name) ? fixture(name) : { current_page: 1, last_page: 1, per_page: 100, total: 0, items: [] });
  }
  if (request.method === "POST" && path === "/shipments/calculations") {
    let raw = "";
    request.on("data", (chunk) => (raw += chunk));
    request.on("end", () => {
      const country = (JSON.parse(raw || "{}") as { recipient?: { countryCode?: string } }).recipient?.countryCode ?? "";
      const name = CALCULATIONS[country];
      if (name) send(200, fixture(name));
      else send(422, fixture("error-422"));
    });
    return;
  }
  return send(404, { errors: { errorMessage: `The route ${path} could not be found.` } });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Nova Post fixture server on http://127.0.0.1:${port}/v.1.0`);
});
