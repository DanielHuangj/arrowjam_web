import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "@arrowjaw/shared";
import {
  enforceBlackHolesInPlayableDraft,
  loadRegionDraftCells,
  toggleRegionDraftCell,
  validatePlayableCommit,
  validateBlackHoleCommit,
} from "./board-region.ts";
import { vecKey } from "@arrowjaw/shared";

describe("board-region", () => {
  it("loads full board as playable draft by default", () => {
    const doc = createEmptyDocument({ width: 4, height: 3 });
    const draft = loadRegionDraftCells(doc, "playable");
    expect(draft.size).toBe(12);
  });

  it("toggles playable draft cells", () => {
    const doc = createEmptyDocument({ width: 3, height: 3 });
    let draft = loadRegionDraftCells(doc, "playable");
    draft = toggleRegionDraftCell(draft, [0, 0]);
    expect(draft.has(vecKey([0, 0]))).toBe(false);
  });

  it("rejects empty playable commit", () => {
    const doc = createEmptyDocument({ width: 3, height: 3 });
    expect(validatePlayableCommit(doc, new Set())).toBe("empty");
  });

  it("rejects black hole outside playable", () => {
    const doc = createEmptyDocument({ width: 4, height: 4 });
    doc.meta.boardShape = "custom";
    doc.meta.playableMask = { rows: [[1, 1, 2]] };
    const playable = loadRegionDraftCells(doc, "playable");
    expect(validateBlackHoleCommit(doc, new Set([vecKey([0, 0])]), playable)).toBe(
      "outsidePlayable",
    );
  });

  it("rejects playable commit that excludes black hole cells", () => {
    const doc = createEmptyDocument({ width: 4, height: 4 });
    doc.meta.boardShape = "custom";
    doc.meta.playableMask = { rows: [[0, 0, 3], [1, 1, 2]] };
    doc.meta.blackHoleRegions = [{ rows: [[1, 1, 1]] }];
    const draft = loadRegionDraftCells(doc, "playable");
    draft.delete(vecKey([1, 1]));
    expect(validatePlayableCommit(doc, draft)).toBe("blackHolesOutside");
  });

  it("keeps black hole cells in playable draft", () => {
    const doc = createEmptyDocument({ width: 3, height: 3 });
    doc.meta.boardShape = "custom";
    doc.meta.playableMask = { rows: [[0, 0, 2], [1, 0, 2], [2, 0, 2]] };
    doc.meta.blackHoleRegions = [{ rows: [[1, 1, 1]] }];
    let draft = loadRegionDraftCells(doc, "playable");
    draft = toggleRegionDraftCell(draft, [1, 1]);
    draft = enforceBlackHolesInPlayableDraft(doc, draft);
    expect(draft.has(vecKey([1, 1]))).toBe(true);
  });
});
