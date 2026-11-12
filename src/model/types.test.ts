import { expect, test } from 'bun:test';
import { deleteMembersAndFreeNodes, emptyModel, type Member, type Model } from './types';

const mem = (id: number, a: number, b: number): Member => ({ id, a, b, sec: 1, mat: 1, angle: 0, type: 'N', relA: 'FFFFFF', relB: 'FFFFFF' });
const frame = (): Model => ({
  ...emptyModel(),
  nodes: [1, 2, 3, 4].map(id => ({ id, x: id, y: 0, z: 0, r: 'RRRRRR' })),
  members: [mem(1, 1, 2), mem(2, 2, 3), mem(3, 3, 4)],
  nodeLoads: [{ lc: 1, node: 4, fx: 0, fy: -1, fz: 0, mx: 0, my: 0, mz: 0 }],
});

test('deleting an end member removes the node it leaves free, and that node\'s loads', () => {
  const m = deleteMembersAndFreeNodes(frame(), new Set([3]));
  expect(m.members.map(x => x.id)).toEqual([1, 2]);
  expect(m.nodes.map(x => x.id)).toEqual([1, 2, 3]);
  expect(m.nodeLoads).toEqual([]);
});

test('nodes still joined to another member stay', () => {
  const m = deleteMembersAndFreeNodes(frame(), new Set([2]));
  expect(m.nodes.map(x => x.id)).toEqual([1, 2, 3, 4]);
});

test('a member between two otherwise unattached nodes takes both nodes with it', () => {
  const m = deleteMembersAndFreeNodes({ ...frame(), members: [mem(1, 1, 2), mem(3, 3, 4)] }, new Set([1]));
  expect(m.nodes.map(x => x.id)).toEqual([3, 4]);
});

test('a node that was already free is not touched', () => {
  const f = frame(), m = deleteMembersAndFreeNodes({ ...f, nodes: [...f.nodes, { id: 9, x: 9, y: 9, z: 0, r: 'RRRRRR' }] }, new Set([3]));
  expect(m.nodes.map(x => x.id)).toEqual([1, 2, 3, 9]);
});
