import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const priority = z.enum(["P1", "P2", "P3"]);
const taskSchema = z.object({
  id: z.string().regex(/^EP\d{2}-\d{2}$/), parentId: z.string(), title: z.string().min(1),
  area: z.enum(["frontend", "backend"]), estimate: z.number().int().positive(), priority,
  status: z.enum(["Backlog", "Ready", "In Progress", "Review", "Done"]), phase: z.enum(["POC", "MVP"]),
  acceptanceCriteria: z.array(z.string().min(1)).min(1), labels: z.array(z.string().min(1)).min(1),
});
const backlogSchema = z.object({ name: z.string().min(1), epics: z.array(z.object({
  id: z.string().regex(/^EP\d{2}$/), title: z.string().min(1), goal: z.string().min(1),
  labels: z.array(z.string().min(1)).min(1), priority, tasks: z.array(taskSchema).min(2),
})).min(4) });
export type Backlog = z.infer<typeof backlogSchema>;
export type IssuePlan = { id: string; parentId?: string; title: string; body: string; labels: string[] };
export type Options = { apply: boolean; repo?: string; owner?: string; projectId?: string };
export type Transport = (path: string, method?: "GET" | "POST", body?: unknown, allow404?: boolean) => Promise<unknown>;

export function validateBacklog(input: unknown): Backlog {
  const backlog = backlogSchema.parse(input);
  const ids = new Set<string>();
  for (const epic of backlog.epics) {
    if (ids.has(epic.id)) throw new Error(`Identifiant dupliqué : ${epic.id}`);
    ids.add(epic.id);
    if (!epic.labels.includes("type:epic")) throw new Error(`Label d’epic manquant : ${epic.id}`);
    if (!epic.tasks.some(task => task.area === "frontend") || !epic.tasks.some(task => task.area === "backend")) throw new Error(`Chaque epic nécessite des tâches frontend et backend : ${epic.id}`);
    for (const task of epic.tasks) {
      if (ids.has(task.id)) throw new Error(`Identifiant dupliqué : ${task.id}`);
      ids.add(task.id);
      if (task.parentId !== epic.id || !task.id.startsWith(`${epic.id}-`)) throw new Error(`Hiérarchie invalide : ${task.id}`);
      for (const label of [`area:${task.area}`, `priority:${task.priority.toLowerCase()}`, `phase:${task.phase.toLowerCase()}`, "type:feature"]) {
        if (!task.labels.includes(label)) throw new Error(`Label ${label} manquant : ${task.id}`);
      }
    }
  }
  return backlog;
}

export const marker = (id: string) => `<!-- elite-pack-backlog:v1:${id} -->`;
export function buildPlan(backlog: Backlog): IssuePlan[] {
  return backlog.epics.flatMap(epic => [
    { id: epic.id, title: `[${epic.id}] ${epic.title}`, labels: epic.labels, body: `${marker(epic.id)}\n\n${epic.goal}\n\nPriorité : ${epic.priority}\n\n## Sous-tâches prévues\n\n${epic.tasks.map(task => `- ${task.id} — ${task.title}`).join("\n")}` },
    ...epic.tasks.map(task => ({ id: task.id, parentId: epic.id, title: `[${task.id}] ${task.title}`, labels: task.labels,
      body: `${marker(task.id)}\n\nEpic : ${epic.id}\nDomaine : ${task.area === "frontend" ? "Interface" : "Serveur"}\nPhase : ${task.phase}\nEstimation : ${task.estimate} points\nPriorité : ${task.priority}\nStatut initial proposé : ${task.status}\n\n## Critères d’acceptation\n\n${task.acceptanceCriteria.map(value => `- [ ] ${value}`).join("\n")}`,
    })),
  ]);
}

export function renderPreview(backlog: Backlog): string {
  const tasks = backlog.epics.flatMap(epic => epic.tasks);
  return [`# ${backlog.name}`, "", "Simulation locale : aucune lecture ni écriture GitHub.", "", `${backlog.epics.length} epics · ${tasks.length} sous-tâches · ${tasks.reduce((sum, task) => sum + task.estimate, 0)} points`, "",
    ...backlog.epics.flatMap(epic => [`## ${epic.id} — ${epic.title}`, "", epic.goal, "", ...epic.tasks.map(task => `- ${task.id} · ${task.area} · ${task.estimate} points · ${task.priority} · ${task.status} — ${task.title}`), ""]),
    "Application explicite : --apply --repo propriétaire/dépôt --owner propriétaire --project-id PVT_…", "Les champs et workflows du projet sont configurés selon docs/github-projects.md.", "",
  ].join("\n");
}

export function parseOptions(args: string[]): Options {
  const result: Options = { apply: false };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--apply") result.apply = true;
    else if (argument === "--repo" || argument === "--owner" || argument === "--project-id") {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`Valeur manquante : ${argument}`);
      if (argument === "--repo") result.repo = value;
      else if (argument === "--owner") result.owner = value;
      else result.projectId = value;
    } else throw new Error("Option inconnue. Utilisez uniquement --apply, --repo, --owner et --project-id; le jeton doit rester dans GH_TOKEN.");
  }
  if (result.apply) {
    if (!result.repo || !/^[\w.-]+\/[\w.-]+$/.test(result.repo) || !result.owner || !/^[\w-]+$/.test(result.owner) || !result.projectId?.startsWith("PVT_")) throw new Error("Application : fournissez --repo propriétaire/dépôt, --owner propriétaire et --project-id PVT_… d’un projet existant.");
    if (result.repo.split("/")[0]?.toLowerCase() !== result.owner.toLowerCase()) throw new Error("Le dépôt et le projet doivent appartenir au propriétaire indiqué.");
  }
  return result;
}

export function createTransport(token: string): Transport {
  return async (path, method = "GET", body, allow404 = false) => {
    let response: Response;
    try {
      response = await fetch(`https://api.github.com${path}`, { method,
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2026-03-10" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000), redirect: "error",
      });
    } catch { throw new Error("Connexion GitHub interrompue. Relancez la même commande pour reprendre depuis les marqueurs existants."); }
    if (allow404 && response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub HTTP ${response.status} : vérifier les accès ou quotas puis relancer. Aucun détail de jeton n’est affiché.`);
    return response.json();
  };
}

const issueSchema = z.object({ id: z.number(), number: z.number(), node_id: z.string(), body: z.string().nullable(), pull_request: z.unknown().optional() });
type Issue = z.infer<typeof issueSchema>;
async function graphql(transport: Transport, query: string, variables: Record<string, unknown>) {
  const result = z.object({ data: z.record(z.string(), z.unknown()).nullable().optional(), errors: z.array(z.unknown()).optional() }).parse(await transport("/graphql", "POST", { query, variables }));
  if (result.errors?.length || !result.data) throw new Error("GraphQL GitHub a refusé l’opération. Vérifiez les permissions et la configuration du projet.");
  return result.data;
}

export async function runBootstrap(backlog: Backlog, options: Options, transport?: Transport): Promise<string> {
  // Le chemin par défaut ne crée même pas de client HTTP et fonctionne sans jeton.
  if (!options.apply) return renderPreview(backlog);
  parseOptions(["--apply", "--repo", options.repo ?? "", "--owner", options.owner ?? "", "--project-id", options.projectId ?? ""]);
  if (!transport) throw new Error("Transport GitHub requis en mode application.");
  const base = `/repos/${options.repo}`;
  const plan = buildPlan(backlog);
  const projectData = await graphql(transport, "query($id:ID!){node(id:$id){... on ProjectV2{id owner{... on User{login} ... on Organization{login}}}}}", { id: options.projectId });
  const project = z.object({ id: z.string(), owner: z.object({ login: z.string() }) }).parse(projectData.node);
  if (project.owner.login.toLowerCase() !== options.owner?.toLowerCase()) throw new Error("Le projet ne correspond pas au propriétaire demandé.");
  // Liste toutes les issues, même closes. Les PR ne portent pas nos marqueurs.
  const existing: Issue[] = [];
  for (let page = 1; ; page++) {
    const batch = z.array(issueSchema).parse(await transport(`${base}/issues?state=all&per_page=100&page=${page}`));
    existing.push(...batch.filter(issue => !issue.pull_request));
    if (batch.length < 100) break;
  }
  const issues = new Map<string, Issue>();
  for (const item of plan) {
    const matches = existing.filter(issue => issue.body?.includes(marker(item.id)));
    if (matches.length > 1) throw new Error(`Plusieurs issues portent le marqueur ${item.id}; résoudre ce conflit avant reprise.`);
    if (matches[0]) issues.set(item.id, matches[0]);
  }
  const existingLabels = new Set<string>();
  for (let page = 1; ; page++) {
    const labels = z.array(z.object({ name: z.string() })).parse(await transport(`${base}/labels?per_page=100&page=${page}`));
    for (const label of labels) existingLabels.add(label.name.toLowerCase());
    if (labels.length < 100) break;
  }
  for (const name of new Set([...plan.flatMap(item => item.labels), "type:bug", "status:backlog"])) {
    if (!existingLabels.has(name.toLowerCase())) await transport(`${base}/labels`, "POST", { name, color: name.startsWith("area:") ? "1D76DB" : name.startsWith("priority:") ? "B60205" : "7057FF" });
  }
  let created = 0;
  for (const item of plan) {
    if (!issues.has(item.id)) {
      const issue = issueSchema.parse(await transport(`${base}/issues`, "POST", { title: item.title, body: item.body, labels: item.labels }));
      issues.set(item.id, issue); created++;
    }
    if (item.parentId) {
      const issue = issues.get(item.id)!;
      const expected = issues.get(item.parentId)!;
      const parent = await transport(`${base}/issues/${issue.number}/parent`, "GET", undefined, true);
      if (parent === null) await transport(`${base}/issues/${expected.number}/sub_issues`, "POST", { sub_issue_id: issue.id, replace_parent: false });
      else if (issueSchema.parse(parent).id !== expected.id) throw new Error(`L’issue ${item.id} a déjà un autre parent; aucun remplacement automatique.`);
    }
  }
  const contents = new Set<string>();
  let cursor: string | null = null;
  do {
    const data = await graphql(transport, "query($id:ID!,$after:String){node(id:$id){... on ProjectV2{items(first:100,after:$after){nodes{content{... on Issue{id}}} pageInfo{hasNextPage endCursor}}}}}", { id: options.projectId, after: cursor });
    const projectItems = z.object({ items: z.object({ nodes: z.array(z.object({ content: z.object({ id: z.string().optional() }).nullable() })), pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }) }) }).parse(data.node).items;
    for (const node of projectItems.nodes) if (node.content?.id) contents.add(node.content.id);
    cursor = projectItems.pageInfo.hasNextPage ? projectItems.pageInfo.endCursor : null;
  } while (cursor);
  for (const issue of issues.values()) if (!contents.has(issue.node_id)) await graphql(transport, "mutation($projectId:ID!,$contentId:ID!){addProjectV2ItemById(input:{projectId:$projectId,contentId:$contentId}){item{id}}}", { projectId: options.projectId, contentId: issue.node_id });
  const viewData = await graphql(transport, "query($id:ID!){node(id:$id){... on ProjectV2{views(first:100){nodes{name} pageInfo{hasNextPage}}}}}", { id: options.projectId });
  const views = z.object({ views: z.object({ nodes: z.array(z.object({ name: z.string() })), pageInfo: z.object({ hasNextPage: z.boolean() }) }) }).parse(viewData.node).views;
  if (views.pageInfo.hasNextPage) throw new Error("Projet avec plus de 100 vues : vérifier les vues manuellement avant création.");
  for (const [name, layout] of [["Kanban Elite Pack", "BOARD_LAYOUT"], ["Backlog Elite Pack", "TABLE_LAYOUT"]]) if (!views.nodes.some(view => view.name === name)) await graphql(transport, "mutation($projectId:ID!,$name:String!,$layout:ProjectV2ViewLayout!){createProjectV2View(input:{projectId:$projectId,name:$name,layout:$layout}){clientMutationId}}", { projectId: options.projectId, name, layout });
  return `${created} issues créées, ${plan.length - created} réutilisées. Hiérarchie et éléments du projet vérifiés. Vues présentes. Terminez les champs et workflows selon docs/github-projects.md.`;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const backlog = validateBacklog(JSON.parse(await readFile(new URL("../../docs/backlog.json", import.meta.url), "utf8")));
  const token = options.apply ? process.env.GH_TOKEN : undefined;
  if (options.apply && !token) throw new Error("Définissez GH_TOKEN dans l’environnement; aucun jeton ne doit apparaître dans la commande ou le dépôt.");
  console.log(await runBootstrap(backlog, options, token ? createTransport(token) : undefined));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error instanceof Error ? error.message : "Préparation GitHub impossible."); process.exitCode = 1; });
