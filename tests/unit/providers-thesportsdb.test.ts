import { afterEach, describe, expect, it, vi } from "vitest";
import { TheSportsDbProvider } from "../../src/providers/thesportsdb/client";

vi.mock("server-only", () => ({}));
const player = { idPlayer: "42", strPlayer: "Athlète exemple" };
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

afterEach(() => vi.useRealTimers());

describe("TheSportsDB", () => {
  it("normalise les champs absents et interdit les images sans licence", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ players: [{ ...player, strThumb: "https://example.com/image.jpg" }] }));
    const provider = new TheSportsDbProvider({ apiKey: "123" }, fetcher);
    const athlete = await provider.getAthlete("42");
    expect(athlete).toMatchObject({ fullName: player.strPlayer, sportName: null, birthDate: null });
    expect(athlete?.images[0]).toMatchObject({ license: null, approvedForDisplay: false });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("lookupplayer.php?id=42");
  });

  it("traite une recherche vide et encode ses paramètres", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ player: null }));
    const provider = new TheSportsDbProvider({ apiKey: "123" }, fetcher);
    expect(await provider.searchAthletes("Nom & prénom")).toEqual([]);
    expect(new URL(String(fetcher.mock.calls[0]?.[0])).searchParams.get("p")).toBe("Nom & prénom");
    expect(provider.capabilities.athletesBySport).toBe(false);
  });

  it("valide les identifiants avant le réseau", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const provider = new TheSportsDbProvider({ apiKey: "123" }, fetcher);
    await expect(provider.getAthlete("../secret")).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejette une réponse fournisseur invalide", async () => {
    const provider = new TheSportsDbProvider({ apiKey: "123" }, vi.fn<typeof fetch>().mockResolvedValue(response({ players: [{ idPlayer: "42" }] })));
    await expect(provider.getAthlete("42")).rejects.toThrow();
  });

  it("espace les requêtes concurrentes pour respecter le quota gratuit", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response({ players: null }));
    const provider = new TheSportsDbProvider({ apiKey: "123" }, fetcher);
    const first = provider.getAthlete("1");
    const second = provider.getAthlete("2");
    await first;
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2100);
    await second;
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("borne les tentatives et attend une minute après un 429", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 429 }));
    const provider = new TheSportsDbProvider({ apiKey: "123", maxRetries: 1 }, fetcher);
    const assertion = expect(provider.getAthlete("1")).rejects.toThrow("429");
    await vi.advanceTimersByTimeAsync(59_999);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("masque les URLs contenant une clé lorsque le réseau échoue", async () => {
    const provider = new TheSportsDbProvider({ apiKey: "987654" }, vi.fn<typeof fetch>().mockRejectedValue(new Error("url/987654")));
    await expect(provider.getAthlete("1")).rejects.toThrow("temporairement indisponible");
  });

  it("récupère le catalogue disponible sans inventer sa traduction", async () => {
    const provider = new TheSportsDbProvider({ apiKey: "123" }, vi.fn<typeof fetch>().mockResolvedValue(response({ sports: [{ idSport: "102", strSport: "Soccer" }] })));
    expect(await provider.getSports()).toEqual([{ externalId: "102", providerName: "Soccer", category: null }]);
  });

  it("liste les équipes d’une ligue et exclut l’encadrement de l’effectif", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ teams: [{ idTeam: "7", strTeam: "Équipe", strSport: "Basketball" }] }))
      .mockResolvedValueOnce(response({ player: [{ ...player, strStatus: "Active", strSport: "Basketball" },
        { idPlayer: "43", strPlayer: "Entraîneur", strStatus: "Coaching" }, { idPlayer: "44", strPlayer: "Sans statut" }] }));
    const provider = new TheSportsDbProvider({ apiKey: "123", minIntervalMs: 2_100 }, fetcher);
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 500 });
    expect(await provider.getTeamsByLeague("French Ligue 1")).toEqual([{ externalId: "7", name: "Équipe", sportName: "Basketball" }]);
    expect((await provider.getTeamPlayers("7")).map((row) => row.externalId)).toEqual(["42", "44"]);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("search_all_teams.php?l=French+Ligue+1");
    expect(String(fetcher.mock.calls[1]?.[0])).toContain("lookup_all_players.php?id=7");
  });

  it("expose le statut HTTP d’un refus pour permettre la reprise après un 429", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 429 }));
    const provider = new TheSportsDbProvider({ apiKey: "123", maxRetries: 0 }, fetcher);
    await expect(provider.getTeamPlayers("7")).rejects.toMatchObject({ name: "ProviderRequestError", status: 429 });
  });
});
