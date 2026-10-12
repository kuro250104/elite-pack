import "server-only";
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { db } from "@/lib/db/prisma";
import { createPlayer } from "@/server/players/create-player";
import { authenticateCredentials } from "@/server/auth/service";
const adapter: Adapter = {
  ...PrismaAdapter(db),
  async createUser(data) {
    return db.$transaction((tx) => createPlayer(tx, {...data,email:data.email.trim().toLowerCase()}));
  },
  async getUserByEmail(email) {
    return db.user.findUnique({where:{email:email.trim().toLowerCase()},select:{id:true,email:true,name:true,image:true,emailVerified:true}}) as ReturnType<NonNullable<Adapter["getUserByEmail"]>>;
  },
};
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  providers: [Credentials({credentials:{email:{label:"Adresse e-mail",type:"email"},password:{label:"Mot de passe",type:"password"}},
    authorize:async credentials=>authenticateCredentials({email:credentials.email,password:credentials.password})}),
    ...(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET ? [GitHub] : [])],
  session: {strategy:"jwt",maxAge:86400},
  pages: {signIn:"/connexion",error:"/connexion"},
  callbacks:{
    async jwt({token,user}) {
      if(user?.id)token.sub=user.id;
      if(!token.sub)return null;
      // Ignore client session updates; refresh authorizations from PostgreSQL on every request.
      const current=await db.user.findUnique({where:{id:token.sub},select:{id:true,role:true,name:true,email:true,image:true}});
      if(!current)return null;
      return {...token,sub:current.id,role:current.role,name:current.name,email:current.email,picture:current.image};
    },
    session({session,token}) {
      session.user.id=token.sub!;
      session.user.role=token.role==="ADMIN"?"ADMIN":"PLAYER";
      session.user.name=typeof token.name==="string"?token.name:null;
      session.user.email=typeof token.email==="string"?token.email:"";
      session.user.image=typeof token.picture==="string"?token.picture:null;
      return session;
    },
  },
  logger:{error(error){console.error("Authentification indisponible :",error.name);}},
});
