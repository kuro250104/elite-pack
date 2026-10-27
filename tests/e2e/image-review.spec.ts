import {sessionCookie} from "./auth-session";
import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {PrismaPg} from "@prisma/adapter-pg";
import {PrismaClient} from "../../src/generated/prisma/client";
test("droits des images : refus par défaut, revue administrative et révocation",async({page,baseURL})=>{
  const connectionString=process.env.TEST_DATABASE_URL;
  test.skip(!connectionString,"TEST_DATABASE_URL est nécessaire.");
  const prisma=new PrismaClient({adapter:new PrismaPg({connectionString:connectionString!})});
  const token=randomUUID();
  const user=await prisma.user.create({data:{role:"ADMIN"}});
  const sport=await prisma.sport.create({data:{slug:`image-e2e-${token}`,nameFr:"Sport de test",providerName:`Source ${token}`}});
  const athlete=await prisma.athlete.create({data:{name:`Portrait de test ${token}`,sportId:sport.id}});
  const image=await prisma.athleteImage.create({data:{athleteId:athlete.id,url:"https://upload.wikimedia.org/wikipedia/commons/a/a0/Fixture_de_test.jpg",originalUrl:"https://commons.wikimedia.org/wiki/File:Fixture_de_test.jpg",source:"Fixture de test"}});
  let imageRequests=0;
  // Fixture synthétique : aucune photo ni requête réelle vers Wikimedia pendant les tests.
  await page.route("https://upload.wikimedia.org/**",async route=>{imageRequests++;await route.fulfill({contentType:"image/svg+xml",body:'<svg xmlns="http://www.w3.org/2000/svg" width="480" height="600"><rect width="480" height="600" fill="#263342"/></svg>'});});
  try{
    await page.context().addCookies([await sessionCookie(user.id,baseURL!)]);
    await page.goto(`/admin/images?query=${token}`);
    const card=page.locator("article").filter({hasText:athlete.name});
    await expect(card.getByText("Affichage non autorisé",{exact:true})).toBeVisible();
    expect(imageRequests).toBe(0);
    await expect(card.locator('img')).toHaveCount(0);
    await card.getByLabel("URL de la preuve des droits",{exact:true}).fill("https://commons.wikimedia.org/wiki/File:Fixture_de_test.jpg#Licensing");
    await card.getByLabel("Attribution à afficher",{exact:true}).fill("Auteur de fixture — CC BY 4.0");
    await card.getByLabel("Licence compatible",{exact:true}).selectOption("CC-BY-4.0");
    await card.getByRole("button",{name:"Enregistrer les métadonnées",exact:true}).click();
    await expect(card.getByRole("button",{name:"Enregistrer les métadonnées",exact:true})).toBeEnabled();
    expect((await prisma.athleteImage.findUniqueOrThrow({where:{id:image.id}})).version).toBe(1);
    await card.getByRole("checkbox").check();
    await card.getByLabel("Motif de la décision (obligatoire)").fill("Scénario synthétique : droits de la fixture examinés.");
    await card.getByRole("button",{name:"Approuver l’affichage",exact:true}).click();
    await expect(card.getByText("Affichage autorisé",{exact:true})).toBeVisible();
    await expect(card.getByRole("img",{name:`Portrait de ${athlete.name}`,exact:true})).toBeVisible();
    await expect.poll(()=>imageRequests).toBeGreaterThan(0);
    await expect(card.getByText("Auteur de fixture — CC BY 4.0",{exact:false}).first()).toBeVisible();
    await card.getByLabel("Motif de la décision (obligatoire)").fill("Révocation de la fixture.");
    await card.getByRole("button",{name:"Refuser l’affichage",exact:true}).click();
    await expect(card.getByText("Affichage non autorisé",{exact:true})).toBeVisible();
    await expect(card.locator('img')).toHaveCount(0);
    expect(await prisma.athleteImage.findUniqueOrThrow({where:{id:image.id}})).toMatchObject({approvedForDisplay:false,version:3,decisionReason:"Révocation de la fixture."});
    const denied=await page.request.patch(`/api/admin/images/${image.id}`,{headers:{origin:"https://evil.invalid"},data:{action:"reject",expectedVersion:3,reason:"Test"}});
    expect(denied.status()).toBe(403);
    await page.setViewportSize({width:390,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.screenshot({path:"/tmp/elite-pack-image-review-mobile.png",fullPage:true});
    await prisma.user.update({where:{id:user.id},data:{role:"PLAYER"}});
    expect((await page.request.patch(`/api/admin/images/${image.id}`,{data:{action:"reject",expectedVersion:3,reason:"Test"}})).status()).toBe(403);
    await page.goto("/admin/images");
    await expect(page).toHaveURL(/\/dashboard/);
  }finally{
    await prisma.$transaction(async tx=>{
      await tx.adminAuditLog.deleteMany({where:{actorId:user.id}});
      await tx.rateLimitBucket.deleteMany({where:{key:`admin-api:${user.id}`}});
      await tx.athlete.delete({where:{id:athlete.id}});
      await tx.sport.delete({where:{id:sport.id}});
      await tx.user.delete({where:{id:user.id}});
    });
    await prisma.$disconnect();
  }
});
