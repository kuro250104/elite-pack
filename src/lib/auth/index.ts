import "server-only";
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { db } from "@/lib/db/prisma";
import { createPlayer } from "@/server/players/create-player";
const adapter: Adapter = {
  ...PrismaAdapter(db),
  async createUser(data) {
    return db.$transaction((tx) => createPlayer(tx, data));
  },
};
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  providers: process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET ? [GitHub] : [],
  session: {strategy: "database"},
  pages: {signIn: "/connexion", error: "/connexion"},
  callbacks: {session({session, user}) {session.user.id = user.id; session.user.role = (user as typeof user & {role: "PLAYER" | "ADMIN"}).role; return session;}},
});
