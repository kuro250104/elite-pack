import { describe, expect, it, vi } from "vitest";
import { honourPoints, prestigeWithinSport } from "@/server/athletes/prestige";
import { TheSportsDbProvider } from "@/providers/thesportsdb/client";

vi.mock("server-only", () => ({}));

describe("Points de palmarès", () => {
  it("compte les titres distincts et ignore les entrées inexploitables", () => {
    expect(honourPoints(null)).toBe(0);
    expect(honourPoints({ titres: 3 })).toBe(0);
    expect(honourPoints([
      { title: "Ligue 1", year: "2019" }, { title: "ligue 1 ", year: "2019" }, { title: "Ligue 1", year: "2020" },
      { name: "Coupe de France" }, "Ballon d’or", "", { title: "" }, 42, null,
    ])).toBe(4);
  });
});

describe("Prestige relatif au sport", () => {
  it("attribue 0 sans titre, un rang centile partagé en cas d’égalité et 100 au maximum", () => {
    const scores = prestigeWithinSport(new Map([["a", 0], ["b", 1], ["c", 3], ["d", 3], ["e", 5]]));
    expect(Object.fromEntries(scores)).toEqual({ a: 0, b: 30, c: 60, d: 60, e: 90 });
    expect(Object.fromEntries(prestigeWithinSport(new Map([["seul", 5]])))).toEqual({ seul: 50 });
    expect(Object.fromEntries(prestigeWithinSport(new Map([["x", 0], ["y", 0]])))).toEqual({ x: 0, y: 0 });
    expect(prestigeWithinSport(new Map())).toEqual(new Map());
  });

  it("reste entre 1 et 100 pour tout athlète titré", () => {
    const points = new Map(Array.from({ length: 200 }, (_, index) => [`a${index}`, index % 7]));
    for (const [id, score] of prestigeWithinSport(points)) {
      if (points.get(id)! > 0) { expect(score).toBeGreaterThanOrEqual(1); expect(score).toBeLessThanOrEqual(100); }
      else expect(score).toBe(0);
    }
  });
});

describe("Palmarès TheSportsDB", () => {
  it("appelle lookuphonours.php et normalise les titres", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ honours: [
      { idHonour: "749", strHonour: " Brazilian Brasileirao ", strSeason: "2011", strTeam: "Corinthians", strPlayer: "ignoré" },
      { idHonour: "750", strHonour: "Copa", strSeason: "", strTeam: null },
    ] }), { status: 200 }));
    const provider = new TheSportsDbProvider({ apiKey: "123" }, fetcher);
    expect(provider.capabilities.honours).toBe(true);
    expect(await provider.getHonours("34147178")).toEqual([
      { externalId: "749", title: "Brazilian Brasileirao", season: "2011", team: "Corinthians" },
      { externalId: "750", title: "Copa", season: null, team: null },
    ]);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("lookuphonours.php?id=34147178");
  });

  it("renvoie une liste vide sans titre et refuse un identifiant invalide sans appel réseau", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ honours: null }), { status: 200 }));
    const provider = new TheSportsDbProvider({ apiKey: "123" }, fetcher);
    expect(await provider.getHonours("1")).toEqual([]);
    await expect(provider.getHonours("../1")).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("Créneau du quota partagé TheSportsDB", () => {
  it("attend le délai annoncé puis réessaie, sans dépasser deux nouvelles tentatives ni 5 secondes d’attente", async () => {
    const { waitForProviderSlot } = await import("@/server/imports/service");
    const { ApiError } = await import("@/lib/api/errors");
    const waits: number[] = [];
    const wait = async (ms: number) => { waits.push(ms); };
    let calls = 0;
    await waitForProviderSlot(async () => { if (++calls < 3) throw new ApiError("RATE_LIMITED", "Trop de requêtes.", 429, 2); }, wait);
    expect([calls, waits]).toEqual([3, [2000, 2000]]);
    await expect(waitForProviderSlot(async () => { throw new ApiError("RATE_LIMITED", "Trop de requêtes.", 429, 1); }, wait)).rejects.toMatchObject({ status: 429 });
    await expect(waitForProviderSlot(async () => { throw new ApiError("RATE_LIMITED", "Trop de requêtes.", 429, 60); }, wait)).rejects.toMatchObject({ retryAfter: 60 });
    await expect(waitForProviderSlot(async () => { throw new Error("Autre panne"); }, wait)).rejects.toThrow("Autre panne");
  });
});
