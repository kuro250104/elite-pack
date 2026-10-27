import {randomUUID,createHash} from "node:crypto";
import {expect,test} from "@playwright/test";
import {PrismaPg} from "@prisma/adapter-pg";
import {PrismaClient} from "../../src/generated/prisma/client";
test("inscription, connexion locale, droits et déconnexion sans GitHub",async({page,baseURL})=>{
  const connectionString=process.env.TEST_DATABASE_URL;
  test.skip(!connectionString,"TEST_DATABASE_URL est nécessaire.");
  const prisma=new PrismaClient({adapter:new PrismaPg({connectionString:connectionString!})});
  const email=`credentials-${randomUUID()}@example.test`;
  const password=" Mot de passe de fixture 42! ";
  try{
    await page.goto("/inscription");
    await page.getByLabel("Nom affiché",{exact:true}).fill("Joueur de test");
    await page.getByLabel("Adresse e-mail",{exact:true}).fill(email.toUpperCase());
    await page.getByLabel("Mot de passe",{exact:true}).fill(password);
    await page.getByLabel("Confirmer le mot de passe",{exact:true}).fill(password);
    await page.getByRole("button",{name:"Créer mon compte",exact:true}).click();
    await expect(page).toHaveURL(/\/connexion\?registered=1/);
    const user=await prisma.user.findUniqueOrThrow({where:{email},include:{wallet:{include:{transactions:true}},passiveBoosters:true}});
    expect(user.role).toBe("PLAYER");
    expect(user.passwordHash).not.toBe(password);
    expect(user.passwordHash).toMatch(/^scrypt\$/);
    expect(user.wallet?.transactions).toHaveLength(1);
    expect(user.passiveBoosters?.stock).toBe(0);
    const duplicate=await page.request.post("/api/auth/register",{headers:{origin:baseURL!},data:{name:"Autre",email,password,passwordConfirmation:password}});
    expect(duplicate.status()).toBe(201);
    expect((await duplicate.json()).data.message).toContain("La demande a été traitée");
    expect(await prisma.user.count({where:{email}})).toBe(1);
    const forgedRole=await page.request.post("/api/auth/register",{headers:{origin:baseURL!},data:{name:"Autre",email,password,passwordConfirmation:password,role:"ADMIN"}});
    expect(forgedRole.status()).toBe(400);
    const badOrigin=await page.request.post("/api/auth/register",{headers:{origin:"https://evil.invalid"},data:{name:"Autre",email,password,passwordConfirmation:password}});
    expect(badOrigin.status()).toBe(403);
    await page.getByLabel("Adresse e-mail",{exact:true}).fill(email);
    await page.getByLabel("Mot de passe",{exact:true}).fill("Mot de passe incorrect");
    await page.getByRole("button",{name:"Se connecter",exact:true}).click();
    await expect(page.locator("#login-feedback").getByRole("alert")).toContainText("Connexion impossible");
    await page.getByLabel("Mot de passe",{exact:true}).fill(password);
    await page.getByRole("button",{name:"Se connecter",exact:true}).click();
    await expect(page).toHaveURL(/\/dashboard/);
    const cookie=(await page.context().cookies()).find(item=>item.name==="authjs.session-token");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    const session=await page.request.get("/api/auth/session");
    const body=await session.text();
    expect(body).not.toContain("passwordHash");
    expect(body).not.toContain(password);
    const csrf: {csrfToken:string}=await (await page.request.get("/api/auth/csrf")).json();
    const update=await page.request.post("/api/auth/session",{data:{csrfToken:csrf.csrfToken,data:{user:{id:"local-import-operator",role:"ADMIN"}}}});
    expect(update.status()).toBe(200);
    expect((await update.json()).user.role).toBe("PLAYER");
    expect((await page.request.get("/api/admin/imports")).status()).toBe(403);
    await page.getByRole("button",{name:"Se déconnecter",exact:true}).click();
    await expect(page).toHaveURL(`${baseURL}/`);
    await expect.poll(async()=> (await page.context().cookies()).some(item=>item.name==="authjs.session-token")).toBe(false);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/connexion/);
    await page.setViewportSize({width:390,height:844});
    await page.goto("/inscription");
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.screenshot({path:"/tmp/elite-pack-credentials-mobile.png",fullPage:true});
  }finally{
    await prisma.$transaction(async tx=>{
      const user=await tx.user.findUnique({where:{email},select:{id:true}});
      if(user){
        await tx.walletTransaction.deleteMany({where:{wallet:{userId:user.id}}});
        await tx.wallet.deleteMany({where:{userId:user.id}});
        await tx.passiveBoosterState.deleteMany({where:{userId:user.id}});
        await tx.user.delete({where:{id:user.id}});
      }
      const digest=createHash("sha256").update(email).digest("hex");
      await tx.rateLimitBucket.deleteMany({where:{key:{in:[`auth:login:email:${digest}`,`auth:register:email:${digest}`]}}});
    });
    await prisma.$disconnect();
  }
});
