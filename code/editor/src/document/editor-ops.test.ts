import { describe, expect, it } from "vitest";
import { createEmptyDocument, findItemById } from "@arrowjaw/shared";
import {
  addItem,
  applyDragDelta,
  removeItems,
  syncAttachmentsForHost,
  updateItem,
} from "./editor-ops.ts";

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

  it("translates pipe passes when pipe body moves", () => {
    let doc = createEmptyDocument();
    doc = addItem(doc, {
      kind: 3,
      layer: 2,
      health: 2,
      occupiedPositions: [
        [4, 5],
        [5, 5],
        [6, 5],
      ],
      passes: [
        { position: [4, 5], directions: [[-1, 0], [1, 0]] },
        { position: [6, 5], directions: [[-1, 0], [1, 0]] },
      ],
      healthViewPathIndex: 1,
    });
    const pipeId = doc.selectedInstanceIds[0]!;
    doc = updateItem(doc, pipeId, {
      occupiedPositions: [
        [5, 6],
        [6, 6],
        [7, 6],
      ],
    });
    const pipe = doc.itemModels.find((i) => i.instanceId === pipeId)!;
    expect(pipe.passes).toEqual([
      { position: [5, 6], directions: [[-1, 0], [1, 0]] },
      { position: [7, 6], directions: [[-1, 0], [1, 0]] },
    ]);
  });

  it("moves multiple selected items together", () => {
    let doc = createEmptyDocument();
    doc = addItem(doc, {
      kind: 4,
      layer: 2,
      direction1: [1, 0],
      direction2: [0, -1],
      occupiedPositions: [[2, 2]],
    });
    const cornerId = doc.selectedInstanceIds[0]!;
    doc = addItem(doc, {
      kind: 1,
      layer: 2,
      direction: 3,
      colorId: 1,
      occupiedPositions: [
        [4, 2],
        [5, 2],
      ],
    });
    const arrowId = doc.selectedInstanceIds[0]!;
    doc = { ...doc, selectedInstanceIds: [cornerId, arrowId] };

    const snapshots = new Map<number, [number, number][]>([
      [cornerId, [[2, 2]]],
      [arrowId, [[4, 2], [5, 2]]],
    ]);
    const moved = applyDragDelta(doc, snapshots, [2, 2], [3, 2]);
    expect(moved).not.toBeNull();
    expect(findItemById(moved!.itemModels, cornerId)?.occupiedPositions[0]).toEqual([
      3, 2,
    ]);
    expect(findItemById(moved!.itemModels, arrowId)?.occupiedPositions[0]).toEqual([
      5, 2,
    ]);
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
