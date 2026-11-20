import { describe, expect, it, vi } from "vitest";
import { commonsDisplayUrl, plainAttribution } from "@/server/images/commons-import";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ db: {} }));

describe("Portraits Commons", () => {
  it("construit une miniature standard de 500 px sur upload.wikimedia.org, sans paramètre", () => {
    expect(commonsDisplayUrl({ fileUrl: "https://upload.wikimedia.org/wikipedia/commons/c/ce/Oscar_Piastri_Spa_%28cropped%29.jpg", width: 3000 }))
      .toBe("https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/Oscar_Piastri_Spa_%28cropped%29.jpg/500px-Oscar_Piastri_Spa_%28cropped%29.jpg");
    expect(commonsDisplayUrl({ fileUrl: "https://upload.wikimedia.org/wikipedia/commons/c/ce/Petit.jpg", width: 400 }))
      .toBe("https://upload.wikimedia.org/wikipedia/commons/c/ce/Petit.jpg");
  });

  it("refuse les hôtes et chemins non autorisés", () => {
    expect(commonsDisplayUrl({ fileUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/ce/A.jpg/960px-A.jpg?utm_source=x", width: 3000 })).toBeNull();
    expect(commonsDisplayUrl({ fileUrl: "https://upload.wikimedia.org/wikipedia/en/c/ce/A.jpg", width: 3000 })).toBeNull();
    expect(commonsDisplayUrl({ fileUrl: "pas une url", width: null })).toBeNull();
  });

  it("extrait le texte de l’auteur depuis le HTML de Commons", () => {
    expect(plainAttribution("<a href=\"//commons.wikimedia.org/wiki/User:A\">Jean&nbsp;Dupont</a> &amp; <span>Équipe</span>")).toBe("Jean Dupont & Équipe");
    expect(plainAttribution("<span> </span>")).toBeNull();
    expect(plainAttribution(null)).toBeNull();
  });
});
