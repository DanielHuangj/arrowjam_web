import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "@arrowjaw/shared";
import { addItem, removeItems, syncAttachmentsForHost, updateItem } from "./editor-ops.ts";

describe("editor-ops attachments", () => {
  it("syncs frozen overlay when host arrow moves", () => {
    let doc = createEmptyDocument();
    doc = addItem(doc, {
      kind: 1,
      layer: 2,
      direction: 3,
      colorId: 6,
      occupiedPositions: [
        [4, 5],
        [5, 5],
      ],
    });
    const hostId = doc.selectedInstanceIds[0]!;
    doc = addItem(doc, {
      kind: 13,
      layer: 8,
      health: 2,
      occupiedPositions: [
        [4, 5],
        [5, 5],
      ],
    });
    doc = updateItem(doc, hostId, {
      occupiedPositions: [
        [5, 5],
        [6, 5],
      ],
    });
    const frozen = doc.itemModels.find((i) => i.kind === 13);
    expect(frozen?.occupiedPositions).toEqual([
      [5, 5],
      [6, 5],
    ]);
  });

  it("removes bomb when host arrow deleted", () => {
    let doc = createEmptyDocument();
    doc = addItem(doc, {
      kind: 1,
      layer: 2,
      direction: 3,
      colorId: 6,
      occupiedPositions: [[5, 5], [6, 5]],
    });
    const hostId = doc.selectedInstanceIds[0]!;
    doc = addItem(doc, {
      kind: 5,
      layer: 3,
      time: 10,
      occupiedPositions: [[5, 5]],
    });
    doc = removeItems(doc, [hostId]);
    expect(doc.itemModels.some((i) => i.kind === 5)).toBe(false);
  });

  it("syncAttachmentsForHost updates bomb segment", () => {
    let doc = createEmptyDocument();
    doc = addItem(doc, {
      kind: 1,
      layer: 2,
      direction: 3,
      colorId: 6,
      occupiedPositions: [[4, 5], [5, 5], [6, 5]],
    });
    const hostId = doc.selectedInstanceIds[0]!;
    doc = addItem(doc, {
      kind: 5,
      layer: 3,
      time: 10,
      occupiedPositions: [[5, 5]],
    });
    doc = syncAttachmentsForHost(
      doc,
      hostId,
      [
        [5, 5],
        [6, 5],
        [7, 5],
      ],
      [
        [4, 5],
        [5, 5],
        [6, 5],
      ],
    );
    const bomb = doc.itemModels.find((i) => i.kind === 5);
    expect(bomb?.occupiedPositions[0]).toEqual([6, 5]);
  });

  it("does not remove top-level bomb when deleting zone arrow on shared cell", () => {
    let doc = createEmptyDocument();
    doc = {
      ...doc,
      itemModels: [
        {
          kind: 12,
          instanceId: 100,
          layer: 1,
          occupiedPositions: [
            [5, 5],
            [6, 5],
          ],
          items: [
            {
              kind: 1,
              instanceId: 20,
              layer: 2,
              direction: 3,
              colorId: 2,
              occupiedPositions: [
                [5, 5],
                [6, 5],
              ],
            },
          ],
        },
        {
          kind: 1,
          instanceId: 10,
          layer: 2,
          direction: 3,
          colorId: 1,
          occupiedPositions: [
            [5, 5],
            [6, 5],
            [7, 5],
          ],
        },
        {
          kind: 5,
          instanceId: 21,
          layer: 3,
          time: 10,
          occupiedPositions: [[6, 5]],
        },
      ],
    };
    doc = removeItems(doc, [20]);
    expect(doc.itemModels.some((i) => i.instanceId === 21)).toBe(true);
    expect(doc.itemModels.some((i) => i.instanceId === 10)).toBe(true);
  });
});
