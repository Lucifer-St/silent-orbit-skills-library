import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPrivacySafeV1Receipt,
  createV1AcceptanceReceipt,
} from "../create-v1-acceptance-summary.mjs";

test("v1 external receipt is privacy-safe and never claims human authority", () => {
  const receipt = createV1AcceptanceReceipt({
    packageVersion: "0.11.0-beta.8",
    cliVersion: "0.4.0",
    nodeVersion: "24.0.0",
    platform: "linux",
    architecture: "x64",
    doctor: { status: "ok" },
    audit: { status: "attention", sourceFailures: 0 },
    diff: { added: 0, changed: 0, removed: 0 },
    dockerUnmounted: "pass",
    dockerMounted: "pass",
    trustedMaintenance: "not-run",
  });
  assert.equal(receipt.status, "core-pass");
  assert.equal(receipt.acceptanceAuthority, "independent-human-result-required");
  assert.equal(receipt.privacy.absolutePathsIncluded, false);
  assert.doesNotThrow(() => assertPrivacySafeV1Receipt(receipt));
});

test("v1 external receipt rejects private paths and a failed core", () => {
  const failed = createV1AcceptanceReceipt({
    packageVersion: "0.11.0-beta.8",
    cliVersion: "0.4.0",
    nodeVersion: "24.0.0",
    platform: "linux",
    architecture: "x64",
    doctor: { status: "attention" },
    audit: { status: "error", sourceFailures: 1 },
    diff: { added: 1, changed: 0, removed: 0 },
  });
  assert.equal(failed.status, "failed");
  assert.throws(
    () => assertPrivacySafeV1Receipt({
      ...failed,
      location: ["C:", "Users", "Example", "skills"].join("\\"),
    }),
    /private path/,
  );
});
