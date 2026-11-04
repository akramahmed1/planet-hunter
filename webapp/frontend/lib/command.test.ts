import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bodyEntries, isOpenShortcut, lessonEntries, pageEntries, search, targetEntries } from "./command.ts";

const all = [
  ...pageEntries(true),
  ...bodyEntries(),
  ...targetEntries([
    { slug: "toi-700", target: "TOI 700", classification_label: "Clean recovery" },
    { slug: "toi-216", target: "TOI 216", classification_label: "Ambiguous" },
  ]),
  ...lessonEntries([{ slug: "transits", title: "How a planet dims its star", summary: "Why a transit is a dip" }]),
];

describe("command search", () => {
  it("lists the pages for an empty query", () => {
    const r = search(all, "  ");
    assert.ok(r.length > 0 && r.every((e) => e.group === "Pages"));
  });
  it("puts an exact name first and a prefix before a substring", () => {
    assert.equal(search(all, "earth")[0].label, "Earth");
    assert.equal(search(all, "mar")[0].label, "Mars");
    assert.equal(search(all, "toi 700")[0].href, "/candidates/toi-700");
  });
  it("needs every word to match, and ignores case, accents and punctuation", () => {
    assert.deepEqual(search(all, "toi 7000"), []);
    assert.equal(search(all, "TOI-700")[0].href, "/candidates/toi-700");
    assert.equal(search(all, "Sàturn")[0].label, "Saturn");
  });
  it("finds things by their hint and keywords but ranks the name matches higher", () => {
    assert.equal(search(all, "quiz")[0].href, "/learn");
    assert.equal(search(all, "dips")[0]?.href, undefined);
    assert.equal(search(all, "dims")[0].href, "/learn/transits");
  });
  it("is stable and capped", () => {
    assert.deepEqual(search(all, "t"), search(all, "t"));
    assert.ok(search(all, "t", 3).length <= 3);
  });
  it("shows the classroom pages only when classroom is on", () => {
    assert.ok(pageEntries(true).some((e) => e.href === "/my-watchlist"));
    assert.ok(!pageEntries(false).some((e) => e.href === "/my-watchlist" || e.href === "/classroom"));
  });
  it("recognises Cmd+K and Ctrl+K only", () => {
    const k = { key: "k", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false };
    assert.equal(isOpenShortcut({ ...k, ctrlKey: true }), true);
    assert.equal(isOpenShortcut({ ...k, metaKey: true, key: "K" }), true);
    assert.equal(isOpenShortcut(k), false);
    assert.equal(isOpenShortcut({ ...k, ctrlKey: true, shiftKey: true }), false);
    assert.equal(isOpenShortcut({ ...k, ctrlKey: true, key: "j" }), false);
  });
});
