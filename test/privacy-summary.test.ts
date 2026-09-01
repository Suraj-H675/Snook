import assert from "node:assert/strict";
import test from "node:test";
import { getSeededPrivacySummary } from "../lib/privacy/summary.ts";
import { createPrivacySummaryTool } from "../lib/webmcp/tools/get-privacy-summary.ts";

test("returns the same structured seeded summary every time", () => {
  const first = getSeededPrivacySummary();
  const second = getSeededPrivacySummary();

  assert.deepEqual(first, second);
  assert.equal(first.ok, true);
  assert.equal(first.data.dataCategoryCount, 8);
  assert.equal(first.data.enabledOptionalProcessingCount, 6);
  assert.deepEqual(first.data.requiredProcessingCategories, [
    "account_profile",
    "fraud_abuse_signals",
  ]);
  assert.equal(first.data.noChangesMade, true);
});

test("exposes a no-argument read-only WebMCP tool contract", async () => {
  let invocationCount = 0;
  const tool = createPrivacySummaryTool(() => {
    invocationCount += 1;
  });

  assert.equal(tool.name, "get_privacy_summary");
  assert.deepEqual(tool.inputSchema, {
    type: "object",
    properties: {},
    additionalProperties: false,
  });
  assert.deepEqual(tool.annotations, { readOnlyHint: true });
  assert.deepEqual(await tool.execute({}, { signal: new AbortController().signal }), getSeededPrivacySummary());
  assert.equal(invocationCount, 1);
});
