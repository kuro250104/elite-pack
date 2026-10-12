import { describe, expect, it } from "vitest";
import { hasCompatibleImageLicense, imageReviewCommandSchema, isAllowedImageUrl, isPublicHttpsUrl } from "@/server/images/validation";

describe("Validation des droits d’image", () => {
  it.each([
    "http://upload.wikimedia.org/wikipedia/commons/photo.jpg", "https://user:password@upload.wikimedia.org/wikipedia/commons/photo.jpg",
    "https://127.0.0.1/photo.jpg", "https://2130706433/photo.jpg", "https://[::1]/photo.jpg",
    "https://metadata.internal/photo.jpg", "https://localhost/photo.jpg", "https://example.local/photo.jpg",
    "https://example.org:8443/photo.jpg", "https://example.org./photo.jpg", "javascript:alert(1)",
  ])("refuse une référence non sûre : %s", (url) => {
    expect(isPublicHttpsUrl(url)).toBe(false);
  });
  it("autorise les preuves HTTPS sans les télécharger", () => {
    expect(isPublicHttpsUrl("https://commons.wikimedia.org/wiki/File:Photo.jpg")).toBe(true);
    expect(isPublicHttpsUrl("https://creativecommons.org/licenses/by/4.0/")).toBe(true);
  });
  it.each([
    "https://upload.wikimedia.org.attacker.com/wikipedia/commons/photo.jpg", "https://example.org/photo.jpg",
    "https://www.thesportsdb.com/api/photo.jpg", "https://upload.wikimedia.org/wikipedia/commons/photo.jpg?redirect=1",
  ])("refuse une image hors périmètre : %s", (url) => expect(isAllowedImageUrl(url)).toBe(false));
  it("autorise uniquement les hôtes et chemins de fichiers prévus", () => {
    expect(isAllowedImageUrl("https://upload.wikimedia.org/wikipedia/commons/a/a0/Photo.jpg")).toBe(true);
    expect(isAllowedImageUrl("https://www.thesportsdb.com/images/media/player/photo.jpg")).toBe(true);
  });
  it("exige confirmation explicite, raison, version et refuse les champs inconnus", () => {
    const input = { action: "approve", expectedVersion: 0, rightsConfirmed: true, reason: "Preuve examinée" };
    expect(imageReviewCommandSchema.safeParse(input).success).toBe(true);
    for (const patch of [{ rightsConfirmed: false }, { rightsConfirmed: undefined }, { reason: " " }, { expectedVersion: -1 }, { approvedForDisplay: true }]) {
      expect(imageReviewCommandSchema.safeParse({ ...input, ...patch }).success).toBe(false);
    }
  });
  it("requiert le couple licence/version et URL canonique exact", () => {
    expect(hasCompatibleImageLicense("CC-BY-4.0", "https://creativecommons.org/licenses/by/4.0/")).toBe(true);
    expect(hasCompatibleImageLicense("CC0-1.0", "https://creativecommons.org/publicdomain/zero/1.0/")).toBe(true);
    expect(hasCompatibleImageLicense("CC-BY-SA-4.0", "https://creativecommons.org/licenses/by-sa/4.0/")).toBe(true);
    expect(hasCompatibleImageLicense("CC-BY-3.0", "https://creativecommons.org/licenses/by/3.0/")).toBe(false);
    expect(hasCompatibleImageLicense("CC-BY-4.0", "https://creativecommons.org/licenses/by-sa/4.0/")).toBe(false);
    expect(hasCompatibleImageLicense("CC-BY-4.0", null)).toBe(false);
  });
});
