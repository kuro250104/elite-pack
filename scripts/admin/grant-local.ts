import {config} from "dotenv";
import {parseArgs} from "node:util";
import {z} from "zod";
import {db} from "../../src/lib/db/prisma";
config({path:[".env.local",".env"],quiet:true});
let connected=false;
try {
  const {values}=parseArgs({options:{email:{type:"string"},"actor-id":{type:"string"},confirm:{type:"boolean"}},strict:true});
  if(process.env.NODE_ENV==="production" || !values.confirm)throw new Error("Configuration locale confirmée requise.");
  if(!["localhost","127.0.0.1","[::1]"].includes(new URL(process.env.DATABASE_URL??"").hostname))throw new Error("Base locale requise.");
  const email=z.email().parse(values.email?.trim().toLowerCase());
  const actorId=z.string().min(1).parse(values["actor-id"]);
  connected=true;
  await db.$transaction(async tx=>{
    const actor=await tx.user.findUnique({where:{id:actorId},select:{role:true}});
    if(actor?.role!=="ADMIN")throw new Error("Opérateur administrateur requis.");
    const user=await tx.user.findUnique({where:{email},select:{id:true,role:true}});
    if(!user)throw new Error("Créez d’abord le compte depuis le site.");
    if(user.role==="ADMIN")return;
    await tx.user.update({where:{id:user.id},data:{role:"ADMIN"}});
    await tx.adminAuditLog.create({data:{actorId,action:"LOCAL_ADMIN_GRANT",entityType:"User",entityId:user.id,before:{role:user.role},after:{role:"ADMIN"}}});
  });
  console.log("Le compte existant dispose de l’accès administrateur local. Actualisez le site.");
}catch{console.error("Opération impossible : vérifier l’email du compte existant, l’opérateur local et --confirm. Aucun compte n’est créé automatiquement.");process.exitCode=1;}
finally{if(connected)await db.$disconnect().catch(()=>undefined);}
