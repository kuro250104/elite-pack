import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { buildPlan, parseOptions, runBootstrap, validateBacklog, type Transport } from "../../scripts/project/bootstrap";

const source: unknown = JSON.parse(await readFile(new URL("../../docs/backlog.json", import.meta.url), "utf8"));
const backlog = validateBacklog(source);
const options = { apply: true, repo: "kuro250104/elite-pack", owner: "kuro250104", projectId: "PVT_test" };

function fakeGitHub() {
  const issues: { id: number; number: number; node_id: string; body: string }[] = [];
  const parents = new Map<number, number>();
  const labels: { name: string }[] = [];
  const contents = new Set<string>();
  const views: { name: string }[] = [];
  let interruptAfterCreate = false;
  const request: Transport = vi.fn(async (path, method = "GET", rawBody?: unknown) => {
    const body = rawBody as Record<string, unknown> | undefined;
    if (path === "/graphql") {
      const query = String(body?.query);
      const variables = body?.variables as Record<string, unknown>;
      if (query.includes("addProjectV2ItemById")) { contents.add(String(variables.contentId)); return { data: { addProjectV2ItemById: { item: { id: "item" } } } }; }
      if (query.includes("createProjectV2View")) {
        // Valeurs réellement acceptées par le schéma GraphQL GitHub.
        if (!["BOARD_LAYOUT", "TABLE_LAYOUT"].includes(String(variables.layout))) return { errors: [{ message: "Invalid ProjectV2ViewLayout" }] };
        views.push({ name: String(variables.name) }); return { data: { createProjectV2View: { clientMutationId: null } } };
      }
      if (query.includes("items(first")) return { data: { node: { items: { nodes: [...contents].map(id => ({ content: { id } })), pageInfo: { hasNextPage: false, endCursor: null } } } } };
      if (query.includes("views(first")) return { data: { node: { views: { nodes: views, pageInfo: { hasNextPage: false } } } } };
      return { data: { node: { id: "PVT_test", owner: { login: "kuro250104" } } } };
    }
    if (path.includes("/labels?")) return labels;
    if (path.endsWith("/labels") && method === "POST") { labels.push({ name: String(body?.name) }); return {}; }
    if (path.includes("/issues?")) return issues;
    if (path.endsWith("/issues") && method === "POST") {
      const id = issues.length + 1;
      const issue = { id, number: id, node_id: `I_${id}`, body: String(body?.body) };
      issues.push(issue);
      if (interruptAfterCreate) { interruptAfterCreate = false; throw new Error("Interruption après écriture"); }
      return issue;
    }
    const parentMatch = path.match(/\/issues\/(\d+)\/parent$/);
    if (parentMatch) return issues.find(issue => issue.id === parents.get(Number(parentMatch[1]))) ?? null;
    const addMatch = path.match(/\/issues\/(\d+)\/sub_issues$/);
    if (addMatch && method === "POST") { parents.set(Number(body?.sub_issue_id), Number(addMatch[1])); return {}; }
    throw new Error(`Appel inattendu : ${method} ${path}`);
  });
  return { request, issues, parents, labels, contents, views, interrupt: () => { interruptAfterCreate = true; } };
}

describe("Préparation du projet GitHub", () => {
  it("valide quatre epics, seize enfants et un rattachement frontend/backend par epic", () => {
    const plan = buildPlan(backlog);
    expect(plan).toHaveLength(20);
    expect(plan.filter(item => item.parentId)).toHaveLength(16);
    const invalid = structuredClone(backlog);
    invalid.epics[0]!.tasks[0]!.parentId = "EP99";
    expect(() => validateBacklog(invalid)).toThrow("Hiérarchie invalide");
    const wrongArea = structuredClone(backlog);
    for (const task of wrongArea.epics[0]!.tasks) task.area = "backend";
    expect(() => validateBacklog(wrongArea)).toThrow("frontend et backend");
  });
  it("refuse les critères ou estimations manquants et les identifiants dupliqués", () => {
    const invalid = structuredClone(backlog);
    invalid.epics[0]!.tasks[0]!.acceptanceCriteria = [];
    expect(() => validateBacklog(invalid)).toThrow();
    invalid.epics[0]!.tasks[0]!.acceptanceCriteria = ["Vérification"];
    invalid.epics[0]!.tasks[0]!.estimate = 0;
    expect(() => validateBacklog(invalid)).toThrow();
    const duplicate = structuredClone(backlog);
    duplicate.epics[0]!.tasks[1]!.id = duplicate.epics[0]!.tasks[0]!.id;
    expect(() => validateBacklog(duplicate)).toThrow("Identifiant dupliqué");
  });
  it("reste strictement local par défaut, même si un transport est disponible", async () => {
    const request = vi.fn<Transport>();
    expect(parseOptions([])).toEqual({ apply: false });
    expect(await runBootstrap(backlog, { apply: false }, request)).toContain("aucune lecture ni écriture GitHub");
    expect(request).not.toHaveBeenCalled();
  });
  it("refuse l’application sans destination explicite avant tout réseau", async () => {
    const request = vi.fn<Transport>();
    await expect(runBootstrap(backlog, { apply: true }, request)).rejects.toThrow("Valeur manquante");
    expect(request).not.toHaveBeenCalled();
  });
  it("réutilise les issues, liens et items après une seconde exécution sans écraser leur état", async () => {
    const api = fakeGitHub();
    expect(await runBootstrap(backlog, options, api.request)).toContain("20 issues créées");
    const issueWrites = vi.mocked(api.request).mock.calls.filter(([path, method]) => path.endsWith("/issues") && method === "POST");
    expect(issueWrites).toHaveLength(20);
    expect(api.parents.size).toBe(16);
    expect(api.contents.size).toBe(20);
    expect(api.views).toHaveLength(2);
    api.issues[0]!.body += "\n\nNote ajoutée par le développeur.";
    Object.assign(api.issues[0]!, { state: "closed" });
    expect(await runBootstrap(backlog, options, api.request)).toContain("0 issues créées, 20 réutilisées");
    expect(vi.mocked(api.request).mock.calls.filter(([path, method]) => path.endsWith("/issues") && method === "POST")).toHaveLength(20);
    expect(api.views).toHaveLength(2);
    expect(api.issues[0]!.body).toContain("Note ajoutée par le développeur.");
    expect(api.issues[0]).toHaveProperty("state", "closed");
  });
  it("reprend une écriture interrompue sans créer une seconde issue", async () => {
    const api = fakeGitHub(); api.interrupt();
    await expect(runBootstrap(backlog, options, api.request)).rejects.toThrow("Interruption");
    expect(api.issues).toHaveLength(1);
    expect(await runBootstrap(backlog, options, api.request)).toContain("19 issues créées, 1 réutilisées");
    expect(api.issues).toHaveLength(20);
  });
  it("refuse le remplacement d’un parent déjà attribué", async () => {
    const api = fakeGitHub();
    await runBootstrap(backlog, options, api.request);
    api.parents.set(2, 6);
    await expect(runBootstrap(backlog, options, api.request)).rejects.toThrow("autre parent");
    expect(api.parents.get(2)).toBe(6);
  });
});
