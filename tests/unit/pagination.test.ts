import { describe, expect, it } from "vitest";
import { paginationSchema } from "@/lib/validations/pagination";
describe("pagination", () => {it("applique les valeurs par défaut", () => {expect(paginationSchema.parse({})).toEqual({page: 1, pageSize: 24});});it("rejette les limites abusives et fractions", () => {for (const input of [{page: 0}, {pageSize: 101}, {page: 1.5}]) expect(paginationSchema.safeParse(input).success).toBe(false);});});
