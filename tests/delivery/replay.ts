import recordingsFile from "@/lib/delivery/nova-poshta/fixtures/recordings.json";
import type { NovaPoshtaRequest, Transport } from "@/lib/delivery/nova-poshta/api";

type Recording = { request: NovaPoshtaRequest; response: unknown };

export const recordings = recordingsFile.recordings as unknown as Recording[];

export const KYIV = { settlementRef: "e718a680-4b33-11e4-ab6d-005056801329", cityRef: "8d5a980d-391c-11dd-90d9-001a92567626" };
export const LVIV = { settlementRef: "e71abb60-4b33-11e4-ab6d-005056801329", cityRef: "db5c88f5-391c-11dd-90d9-001a92567626" };

/**
 * A transport that answers only the exactly recorded requests (method and every property) and fails the test
 * on anything else, so a test proves the client sends what the API was asked when it was recorded.
 */
export function replayTransport(sent: NovaPoshtaRequest[] = []): Transport {
  return async (request) => {
    sent.push(request);
    const props = request.methodProperties;
    const match = recordings.find(
      (r) =>
        r.request.calledMethod === request.calledMethod &&
        Object.keys(r.request.methodProperties).length === Object.keys(props).length &&
        Object.entries(r.request.methodProperties).every(([key, value]) => props[key] === value),
    );
    if (!match) throw new Error(`no recording for ${request.calledMethod} ${JSON.stringify(props)}`);
    return { ok: true, data: structuredClone(match.response) };
  };
}
