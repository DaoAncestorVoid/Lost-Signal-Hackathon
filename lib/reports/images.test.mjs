import assert from "node:assert/strict";
import { test } from "node:test";
import { isReportImagePath, MAX_IMAGE_BYTES, validateImage } from "./images.ts";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const webp = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]);

test("accepts JPEG, PNG, and WebP contents with matching MIME types", async () => {
  for (const [bytes, type, extension] of [
    [jpeg, "image/jpeg", "jpg"],
    [png, "image/png", "png"],
    [webp, "image/webp", "webp"],
  ]) {
    const result = await validateImage(new File([bytes], `sample.${extension}`, { type }));
    assert.equal(result.extension, extension);
    assert.deepEqual(result.bytes, bytes);
  }
});

test("rejects unsupported, empty, oversized, and mislabeled files", async () => {
  const files = [
    new File([jpeg], "sample.gif", { type: "image/gif" }),
    new File([], "empty.png", { type: "image/png" }),
    new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "large.png", { type: "image/png" }),
    new File([jpeg], "fake.png", { type: "image/png" }),
  ];
  for (const file of files) {
    const result = await validateImage(file);
    assert.ok("error" in result);
  }
});

test("only recognizes paths under the report owner's directory", () => {
  const user = "11111111-1111-4111-8111-111111111111";
  const report = "22222222-2222-4222-8222-222222222222";
  const image = "33333333-3333-4333-8333-333333333333";
  assert.equal(isReportImagePath(`${user}/${report}/${image}.png`, user, report), true);
  assert.equal(isReportImagePath(`${user}/different/${image}.png`, user, report), false);
  assert.equal(isReportImagePath(`different/${report}/${image}.png`, user, report), false);
  assert.equal(isReportImagePath(`${user}/${report}/not-a-uuid.png`, user, report), false);
  assert.equal(isReportImagePath(`${user}/${report}/${image}.png/extra`, user, report), false);
});
