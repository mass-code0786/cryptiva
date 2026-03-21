import assert from "node:assert/strict";
import test from "node:test";

import { buildPopupBannerFilename, parseBase64ImageData, sanitizePopupTargetUrl } from "./popupBannerService.js";

test("sanitizePopupTargetUrl normalizes valid links and rejects invalid", () => {
  assert.equal(sanitizePopupTargetUrl("cryptiva.world/promo"), "https://cryptiva.world/promo");
  assert.equal(sanitizePopupTargetUrl("https://cryptiva.world"), "https://cryptiva.world/");
  assert.equal(sanitizePopupTargetUrl("javascript:alert(1)"), "");
});

test("parseBase64ImageData accepts supported image payload", () => {
  const onePixelPng =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBgR0W0E8AAAAASUVORK5CYII=";

  const parsed = parseBase64ImageData(onePixelPng);
  assert.equal(parsed.mimeType, "image/png");
  assert.equal(parsed.extension, "png");
  assert.equal(parsed.buffer.length > 0, true);
});

test("buildPopupBannerFilename generates stable-safe filename", () => {
  const name = buildPopupBannerFilename({ title: "Big Summer Promo!", originalName: "Banner Hero.PNG", extension: "png" });
  assert.equal(name.endsWith(".png"), true);
  assert.equal(name.includes("banner-hero"), true);
});
