import {describe,expect,it} from "vitest";
import type {AthleteImage} from "@/generated/prisma/client";
import {displayableAthleteImage} from "@/server/images/presentation";
const image:AthleteImage={id:"fixture",athleteId:"athlete",url:"https://upload.wikimedia.org/wikipedia/commons/a/a0/Fixture.jpg",originalUrl:"https://commons.wikimedia.org/wiki/File:Fixture.jpg",source:"Wikimedia Commons",license:"CC-BY-4.0",licenseUrl:"https://creativecommons.org/licenses/by/4.0/",attribution:"Auteur — CC BY 4.0",usageRestrictions:null,approvedForDisplay:true,evidenceUrl:"https://commons.wikimedia.org/wiki/File:Fixture.jpg#Licensing",decisionReason:"Fixture validée",reviewedById:"admin",reviewedAt:new Date(),version:1};
describe("Exposition du portrait",()=>{
  it("masque l’image absente, non revue ou révoquée",()=>{
    expect(displayableAthleteImage(null)).toBeNull();
    expect(displayableAthleteImage({...image,approvedForDisplay:false})).toBeNull();
    expect(displayableAthleteImage({...image,reviewedAt:null})).toBeNull();
    expect(displayableAthleteImage({...image,reviewedById:null})).toBeNull();
  });
  it("refuse l’ancienne approbation sans preuve, attribution ou licence compatible",()=>{
    expect(displayableAthleteImage({...image,evidenceUrl:null})).toBeNull();
    expect(displayableAthleteImage({...image,attribution:" "})).toBeNull();
    expect(displayableAthleteImage({...image,license:"CC-BY-NC-4.0"})).toBeNull();
    expect(displayableAthleteImage({...image,url:"https://localhost/image.jpg"})).toBeNull();
  });
  it("expose uniquement le portrait et ses crédits validés, sans informations de revue",()=>{
    expect(displayableAthleteImage(image)).toEqual({url:image.url,originalUrl:image.originalUrl,attribution:image.attribution,license:image.license,licenseUrl:image.licenseUrl});
  });
});
