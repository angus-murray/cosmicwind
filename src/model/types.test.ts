import { expect, test } from 'bun:test';
import { deleteMembersAndFreeNodes, emptyModel, normalise, releaseCode, restraintCode, type Member, type Model } from './types';

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

test('notes go with the node or member they are attached to', () => {
  const f = { ...frame(), notes: [
    { id: 1, kind: 'node' as const, ref: 4, text: 'node', dx: 20, dy: -20 }, { id: 2, kind: 'member' as const, ref: 3, text: 'member', dx: 20, dy: -20 },
    { id: 3, kind: 'member' as const, ref: 1, text: 'other', dx: 20, dy: -20 },
  ] };
  expect(deleteMembersAndFreeNodes(f, new Set([3])).notes.map(n => n.id)).toEqual([3]);
});

test('an en-dash stands for the default restraint and release', () => {
  expect(restraintCode('–')).toBe('RRRRRR');
  expect(releaseCode('–')).toBe('FFFFFF');
  const m = normalise({ nodes: [{ id: 1, x: 0, y: 0, z: 0, r: 'RRRRRR' }, { id: 2, x: 1, y: 0, z: 0, r: 'FFFFFF' }], members: [mem(1, 1, 2)] });
  expect(m.nodes.map(n => n.r)).toEqual(['–', 'FFFFFF']);
  expect([m.members[0].relA, m.members[0].relB]).toEqual(['–', '–']);
});
