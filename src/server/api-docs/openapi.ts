import "server-only";
import { z } from "zod";
import { paginationSchema } from "@/lib/validations/pagination";
import { economySettingsSchema, boosterSettingsSchema } from "@/server/admin/economy";
import { editionCreateSchema, editionPatchSchema, editionQuerySchema } from "@/server/admin/editions";
import { boosterGrantSchema } from "@/server/admin/grants";
import { encyclopediaQuerySchema } from "@/server/athletes/encyclopedia";
import { athletePatchSchema } from "@/server/athletes/validation";
import { registrationSchema } from "@/server/auth/validation";
import { eventCreateSchema, eventPatchSchema } from "@/server/boosters/events";
import { historyQuerySchema } from "@/server/boosters/history";
import { openBoosterRequestSchema } from "@/server/boosters/opening";
import { collectionQuerySchema } from "@/server/collection/service";
import { bankSaleSchema } from "@/server/economy/bank";
import { imageReviewCommandSchema } from "@/server/images/validation";
import { syncOptionsSchema } from "@/server/imports/sync";
import { importCommandSchema } from "@/server/imports/validation";
import { errorDemoQuerySchema } from "@/server/demo/errors";
import { createListingSchema, marketplaceQuerySchema } from "@/server/marketplace/service";
import { sportPatchSchema } from "@/server/sports/validation";

/**
 * OpenAPI 3.1 document of the Route Handlers. Request bodies and query strings are generated
 * from the Zod schemas the handlers actually use, so the documentation follows the code.
 * tests/unit/openapi.test.ts fails when a route file is missing from this list.
 */

type Method = "get" | "post" | "patch" | "delete";
type Access = "public" | "player" | "admin" | "cron";
type Idempotency = "uuid" | "token";

export interface ApiOperation {
  method: Method;
  path: string;
  tag: string;
  summary: string;
  description?: string;
  access: Access;
  body?: z.ZodType;
  query?: z.ZodObject;
  idempotency?: Idempotency;
  successStatus?: 200 | 201;
}

const adminAthleteQuery = paginationSchema.extend({ query: z.string().trim().max(120).optional() });
const providerSearchQuery = z.object({ query: z.string().trim().min(2).max(120) });
const emptyBody = z.object({}).strict();

export const apiOperations: ApiOperation[] = [
  // Compte
  { method: "post", path: "/api/auth/register", tag: "Compte", access: "public", body: registrationSchema, successStatus: 201,
    summary: "Créer un compte joueur",
    description: "Crée le joueur, son portefeuille, le journal initial et le stock passif à zéro. Les erreurs de saisie sont renvoyées champ par champ dans `error.fields`." },
  { method: "get", path: "/api/me", tag: "Compte", access: "player", summary: "Profil du joueur connecté",
    description: "Solde, cartes possédées, éditions et athlètes découverts, statistiques de boosters." },

  // Collection et encyclopédie
  { method: "get", path: "/api/me/cards", tag: "Collection", access: "player", query: collectionQuerySchema,
    summary: "Cartes du joueur (paginées)", description: "`status=missing` liste les éditions encore manquantes. Les doublons sont comptés par édition." },
  { method: "get", path: "/api/athletes", tag: "Collection", access: "player", query: encyclopediaQuerySchema,
    summary: "Encyclopédie des athlètes" },
  { method: "get", path: "/api/athletes/{id}", tag: "Collection", access: "player",
    summary: "Fiche d’un athlète", description: "Biographie, palmarès et statistiques restent verrouillés tant qu’aucune carte de l’athlète n’a été découverte." },
  { method: "get", path: "/api/sports", tag: "Collection", access: "player", summary: "Catalogue des sports actifs" },
  { method: "get", path: "/api/sports/{id}", tag: "Collection", access: "player", summary: "Détail d’un sport et progression du joueur" },

  // Boosters
  { method: "get", path: "/api/boosters", tag: "Boosters", access: "player", summary: "Types de boosters et sports ouvrables" },
  { method: "get", path: "/api/boosters/passive", tag: "Boosters", access: "player", summary: "Stock de boosters gratuits",
    description: "Calcul paresseux côté serveur : un booster toutes les 15 minutes, plafond de 10. `nextGenerationAt` est indicatif pour l’interface." },
  { method: "post", path: "/api/boosters/open", tag: "Boosters", access: "player", body: openBoosterRequestSchema, idempotency: "uuid",
    summary: "Ouvrir un booster", description: "Tirage cryptographique côté serveur, frappe des exemplaires et consommation du booster dans une seule transaction. En cas d’échec, aucun booster n’est consommé." },
  { method: "post", path: "/api/boosters/welcome", tag: "Boosters", access: "player", body: emptyBody, summary: "Récupérer le booster de bienvenue (une seule fois)" },
  { method: "get", path: "/api/boosters/history", tag: "Boosters", access: "player", query: historyQuerySchema,
    summary: "Historique des ouvertures", description: "Dates `from` et `to` incluses, en heure de Paris." },
  { method: "get", path: "/api/boosters/events", tag: "Boosters", access: "player", summary: "Événements en cours et à venir" },
  { method: "post", path: "/api/boosters/events/{id}/purchase", tag: "Boosters", access: "player", idempotency: "uuid",
    summary: "Acheter ou récupérer un booster événementiel", description: "Débit atomique ; un même `Idempotency-Key` n’est débité qu’une fois." },

  // Économie
  { method: "post", path: "/api/bank/sales", tag: "Économie", access: "player", body: bankSaleSchema, idempotency: "uuid",
    summary: "Revendre une carte à la banque", description: "Prix = valeur de l’édition × taux de rachat configuré. La carte doit appartenir au joueur et ne pas être en vente." },
  { method: "get", path: "/api/marketplace", tag: "Économie", access: "player", query: marketplaceQuerySchema, summary: "Annonces du marché" },
  { method: "post", path: "/api/marketplace/listings", tag: "Économie", access: "player", body: createListingSchema, successStatus: 201,
    summary: "Mettre une carte en vente", description: "Répond 200 au lieu de 201 si l’annonce identique existe déjà (rejeu)." },
  { method: "delete", path: "/api/marketplace/listings/{id}", tag: "Économie", access: "player", summary: "Retirer une annonce" },
  { method: "post", path: "/api/marketplace/listings/{id}/buy", tag: "Économie", access: "player", idempotency: "uuid",
    summary: "Acheter une annonce", description: "Débit de l’acheteur, crédit du vendeur et transfert de la carte dans une seule transaction. Un second acheteur reçoit 409." },

  // Administration
  { method: "get", path: "/api/admin/stats", tag: "Administration", access: "admin", summary: "Indicateurs du tableau de bord" },
  { method: "get", path: "/api/admin/athletes", tag: "Administration", access: "admin", query: adminAthleteQuery, summary: "Rechercher les athlètes importés" },
  { method: "patch", path: "/api/admin/athletes/{id}", tag: "Administration", access: "admin", body: athletePatchSchema,
    summary: "Corriger un athlète", description: "Les corrections restent prioritaires sur les réimports." },
  { method: "get", path: "/api/admin/sports", tag: "Administration", access: "admin", query: paginationSchema, summary: "Lister les sports" },
  { method: "patch", path: "/api/admin/sports/{id}", tag: "Administration", access: "admin", body: sportPatchSchema, summary: "Renommer, activer ou désactiver un sport" },
  { method: "get", path: "/api/admin/editions", tag: "Administration", access: "admin", query: editionQuerySchema, summary: "Lister les éditions de cartes" },
  { method: "post", path: "/api/admin/editions", tag: "Administration", access: "admin", body: editionCreateSchema, successStatus: 201, summary: "Créer une édition" },
  { method: "patch", path: "/api/admin/editions/{id}", tag: "Administration", access: "admin", body: editionPatchSchema,
    summary: "Modifier une édition", description: "Après la première frappe, rareté et mode de tirage sont verrouillés." },
  { method: "get", path: "/api/admin/events", tag: "Administration", access: "admin", summary: "Lister les événements" },
  { method: "post", path: "/api/admin/events", tag: "Administration", access: "admin", body: eventCreateSchema, successStatus: 201, summary: "Créer un événement" },
  { method: "patch", path: "/api/admin/events/{id}", tag: "Administration", access: "admin", body: eventPatchSchema, summary: "Modifier ou activer un événement" },
  { method: "get", path: "/api/admin/economy", tag: "Administration", access: "admin", summary: "Lire les règles économiques" },
  { method: "patch", path: "/api/admin/economy", tag: "Administration", access: "admin", body: economySettingsSchema,
    summary: "Modifier les règles économiques", description: "Chaque changement est historisé (valeur avant et après)." },
  { method: "patch", path: "/api/admin/boosters/{id}", tag: "Administration", access: "admin", body: boosterSettingsSchema,
    summary: "Configurer un type de booster", description: "Les probabilités, en points de base, doivent totaliser 10 000 (100 %)." },
  { method: "post", path: "/api/admin/boosters/grants", tag: "Administration", access: "admin", body: boosterGrantSchema, idempotency: "uuid",
    summary: "Offrir des boosters à tous les joueurs" },
  { method: "patch", path: "/api/admin/images/{id}", tag: "Administration", access: "admin", body: imageReviewCommandSchema,
    summary: "Valider ou refuser les droits d’une image" },
  { method: "get", path: "/api/admin/imports", tag: "Imports", access: "admin", query: paginationSchema, summary: "Historique des imports" },
  { method: "post", path: "/api/admin/imports", tag: "Imports", access: "admin", body: importCommandSchema, idempotency: "token", successStatus: 201,
    summary: "Lancer un import TheSportsDB", description: "Répond 200 lorsque la même clé d’idempotence est rejouée." },
  { method: "get", path: "/api/admin/imports/search", tag: "Imports", access: "admin", query: providerSearchQuery,
    summary: "Rechercher un athlète chez TheSportsDB", description: "Consomme le quota partagé du fournisseur." },
  { method: "post", path: "/api/admin/sync", tag: "Imports", access: "admin", body: z.union([syncOptionsSchema, emptyBody]),
    summary: "Synchroniser un lot d’athlètes", description: "Les corrections manuelles ne sont jamais écrasées ; arrêt automatique si le quota est atteint." },
  { method: "get", path: "/api/cron/sync-athletes", tag: "Imports", access: "cron",
    summary: "Synchronisation planifiée", description: "Appelée par l’ordonnanceur avec `Authorization: Bearer CRON_SECRET`." },

  // Exploitation et documentation
  { method: "get", path: "/api/health", tag: "Documentation", access: "public",
    summary: "État du service", description: "Sonde des conteneurs et de l’orchestrateur : 200 si l’application et PostgreSQL répondent, 503 sinon, sans détail technique." },
  { method: "get", path: "/api/demo/erreur", tag: "Documentation", access: "public", query: errorDemoQuerySchema,
    summary: "Déclencher une erreur de démonstration",
    description: "Répond toujours par une erreur réelle du type demandé (validation Zod, accès refusé, enregistrement Prisma absent, conflit, SQL invalide, plantage). Disponible en développement, ou en production si `ERROR_DEMO_ENABLED=true`." },
  { method: "get", path: "/api/openapi", tag: "Documentation", access: "public",
    summary: "Ce document OpenAPI", description: "Disponible en développement, ou en production si `API_DOCS_ENABLED=true`." },
];

type JsonSchema = Record<string, unknown>;

function toSchema(schema: z.ZodType): JsonSchema {
  // "input" documents what the client sends: defaults are optional and coerced values stay strings.
  const json = { ...(z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as JsonSchema) };
  delete json.$schema;
  return json;
}

function queryParameters(schema: z.ZodObject) {
  const json = toSchema(schema) as { properties?: Record<string, JsonSchema>; required?: string[] };
  return Object.entries(json.properties ?? {}).map(([name, property]) => {
    const { description, ...rest } = property as JsonSchema & { description?: string };
    return { name, in: "query", required: json.required?.includes(name) ?? false, schema: rest, ...(description ? { description } : {}) };
  });
}

const accessText: Record<Access, string> = {
  public: "Accès public.",
  player: "Joueur connecté (cookie de session Auth.js).",
  admin: "Administrateur connecté (rôle ADMIN vérifié en base).",
  cron: "Ordonnanceur uniquement (jeton Bearer).",
};

function errorResponses(operation: ApiOperation) {
  const refs: Record<string, { $ref: string }> = {};
  const add = (status: number) => { refs[String(status)] = { $ref: `#/components/responses/E${status}` }; };
  if (operation.body || operation.query || operation.idempotency || operation.path.includes("{")) add(400);
  if (operation.access !== "public") add(401);
  if (operation.access === "admin" || (operation.method !== "get" && operation.access !== "cron")) add(403);
  if (operation.path.includes("{")) add(404);
  if (operation.method !== "get") add(409);
  if (operation.body) { add(413); add(415); }
  if (operation.access === "player" || operation.access === "admin") add(429);
  add(500);
  if (operation.access === "cron" || operation.path === "/api/health") add(503);
  return refs;
}

function buildOperation(operation: ApiOperation) {
  const parameters: unknown[] = [];
  for (const match of operation.path.matchAll(/\{(\w+)\}/g)) {
    parameters.push({ name: match[1], in: "path", required: true, schema: { type: "string", minLength: 1, maxLength: 100 } });
  }
  if (operation.query) parameters.push(...queryParameters(operation.query));
  if (operation.idempotency) {
    parameters.push({ $ref: operation.idempotency === "uuid" ? "#/components/parameters/IdempotencyUuid" : "#/components/parameters/IdempotencyToken" });
  }
  const security = { public: [], player: [{ session: [] }], admin: [{ session: [] }], cron: [{ cronBearer: [] }] }[operation.access];
  const successStatus = String(operation.successStatus ?? 200);
  return {
    tags: [operation.tag],
    summary: operation.summary,
    description: [accessText[operation.access], operation.description].filter(Boolean).join("\n\n"),
    security,
    ...(parameters.length ? { parameters } : {}),
    ...(operation.body ? { requestBody: { required: true, content: { "application/json": { schema: toSchema(operation.body) } } } } : {}),
    responses: { [successStatus]: { $ref: "#/components/responses/Success" }, ...errorResponses(operation) },
  };
}

const errorExamples: Record<number, [string, string, string]> = {
  400: ["Données invalides", "INVALID_INPUT", "Les données saisies sont invalides."],
  401: ["Non connecté", "UNAUTHENTICATED", "Veuillez vous connecter."],
  403: ["Rôle insuffisant ou origine refusée", "FORBIDDEN", "Cette action est réservée aux administrateurs."],
  404: ["Ressource introuvable", "NOT_FOUND", "Cette ressource est introuvable."],
  409: ["Conflit d’état (carte déjà vendue, stock vide, édition épuisée…)", "CONFLICT", "Cette carte vient d’être vendue."],
  413: ["Corps de requête trop volumineux (64 Kio maximum)", "PAYLOAD_TOO_LARGE", "La requête est trop volumineuse."],
  415: ["Corps non JSON", "INVALID_CONTENT_TYPE", "Une requête JSON est nécessaire."],
  429: ["Trop de requêtes (en-tête Retry-After)", "RATE_LIMITED", "Trop de requêtes, réessayez dans quelques secondes."],
  500: ["Erreur interne, sans détail technique", "INTERNAL_ERROR", "Le service est temporairement indisponible."],
  503: ["Service non configuré ou base de données indisponible", "SERVICE_UNAVAILABLE", "Le service est temporairement indisponible."],
};

export function buildOpenApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const operation of apiOperations) {
    paths[operation.path] = { ...paths[operation.path], [operation.method]: buildOperation(operation) };
  }
  const responses: Record<string, unknown> = {
    Success: { description: "Succès. Le résultat est toujours dans `data`.",
      content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } } } },
  };
  for (const [status, [description, code, message]] of Object.entries(errorExamples)) {
    responses[`E${status}`] = { description,
      headers: { "X-Request-Id": { $ref: "#/components/headers/RequestId" } },
      content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" },
        example: { error: { code, message, requestId: "3f0c2a9e-6b1d-4e7a-9c55-0d2f6a1b8e41" } } } } };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "API Elite Pack",
      version: "0.1.0",
      description: [
        "API du jeu de cartes multisport Elite Pack. Toute la logique de jeu est exécutée côté serveur.",
        "**Format** : succès `{ \"data\": … }`, erreur `{ \"error\": { \"code\", \"message\", \"requestId\", \"fields\"? } }`, réponses `Cache-Control: no-store`.",
        "**Erreurs** : chaque erreur porte un `requestId` (corps et en-tête `X-Request-Id`) qui permet de la retrouver dans les journaux du serveur. En développement uniquement, un champ `debug` ajoute l’erreur d’origine ; en production, aucun détail technique n’est renvoyé. Stratégie complète : `docs/errors.md`.",
        "**Sécurité** : les requêtes qui modifient l’état exigent un en-tête `Origin` du site ; les opérations économiques exigent un `Idempotency-Key`.",
        "**Montants** : entiers de pièces sérialisés en chaînes décimales.",
        "L’authentification elle-même (`/api/auth/*` hors inscription) est gérée par Auth.js et n’est pas décrite ici.",
      ].join("\n\n"),
    },
    servers: [{ url: "/", description: "Serveur courant" }],
    tags: ["Compte", "Collection", "Boosters", "Économie", "Administration", "Imports", "Documentation"].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        session: { type: "apiKey", in: "cookie", name: "authjs.session-token",
          description: "Cookie HTTP-only posé par Auth.js à la connexion (`__Secure-authjs.session-token` en HTTPS)." },
        cronBearer: { type: "http", scheme: "bearer", description: "Secret `CRON_SECRET` de l’ordonnanceur." },
      },
      parameters: {
        IdempotencyUuid: { name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", format: "uuid" },
          description: "UUID unique par opération. Rejouer la même clé ne débite ni ne consomme deux fois." },
        IdempotencyToken: { name: "Idempotency-Key", in: "header", required: true,
          schema: { type: "string", minLength: 8, maxLength: 128, pattern: "^[A-Za-z0-9_-]+$" }, description: "Clé unique par import." },
      },
      schemas: {
        SuccessEnvelope: { type: "object", required: ["data"], properties: { data: {} } },
        ErrorEnvelope: { type: "object", required: ["error"], properties: { error: { type: "object", required: ["code", "message"], properties: {
          code: { type: "string", description: "Code stable, en anglais, destiné au code client." },
          message: { type: "string", description: "Message en français, affichable à l’utilisateur." },
          requestId: { type: "string", format: "uuid", description: "Identifiant de la requête, à rechercher dans les journaux du serveur." },
          fields: { type: "object", additionalProperties: { type: "string" }, description: "Erreurs par champ de formulaire." },
          debug: { type: "object", description: "Développement uniquement : erreur d’origine (nom, message, code, premières lignes de la pile). Jamais présent en production.",
            properties: { name: { type: "string" }, message: { type: "string" }, code: { type: ["string", "number"] }, stack: { type: "array", items: { type: "string" } } } },
        } } } },
      },
      headers: {
        RequestId: { description: "Identifiant de la requête, identique à `error.requestId`.", schema: { type: "string", format: "uuid" } },
      },
      responses,
    },
  };
}

/** The interactive documentation is served in development, or in production when explicitly enabled. */
export function apiDocsEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.API_DOCS_ENABLED === "true";
}
