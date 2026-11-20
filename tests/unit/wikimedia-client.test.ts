import { describe, expect, it, vi } from "vitest";
import { WikimediaClient } from "@/providers/wikimedia/client";

vi.mock("server-only", () => ({}));
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });

describe("Client Wikimedia", () => {
  it("attend puis réessaie après un refus 429 ou une erreur « ratelimited » renvoyée en HTTP 200", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({}, 429, { "retry-after": "3" }))
      .mockResolvedValueOnce(json({ error: { code: "ratelimited" } }))
      .mockResolvedValueOnce(json({ search: [{ id: "Q1" }, { id: "Q2" }] }));
    const wait = vi.fn(async () => {});
    const client = new WikimediaClient({ minIntervalMs: 0 }, fetcher, wait);
    expect(await client.searchPeople("Joueur")).toEqual(["Q1", "Q2"]);
    expect(wait).toHaveBeenCalledWith(4_000);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect((fetcher.mock.calls[0]?.[1]?.headers as Record<string, string>)["User-Agent"]).not.toMatch(/@/);
  });

  it("ne lit que les dates de naissance précises au jour, la nature humaine et l’image", async () => {
    const claim = (value: unknown) => ({ mainsnak: { datavalue: { value } } });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ entities: { Q1: { id: "Q1", claims: {
      P31: [claim({ id: "Q5" })], P569: [claim({ time: "+1998-12-20T00:00:00Z", precision: 11 }), claim({ time: "+1998-00-00T00:00:00Z", precision: 9 })],
      P18: [claim("Portrait.jpg")] } }, Q2: { id: "Q2", missing: "" } } }));
    const client = new WikimediaClient({ minIntervalMs: 0 }, fetcher, async () => {});
    expect(await client.getPeople(["Q1", "Q2"])).toEqual([{ qid: "Q1", human: true, birthDates: ["1998-12-20"], imageFile: "Portrait.jpg" }]);
  });

  it("échoue clairement sur une autre erreur de l’API", async () => {
    const client = new WikimediaClient({ minIntervalMs: 0 }, vi.fn<typeof fetch>().mockResolvedValue(json({ error: { code: "badvalue" } })), async () => {});
    await expect(client.searchPeople("Joueur")).rejects.toThrow("badvalue");
  });
});
