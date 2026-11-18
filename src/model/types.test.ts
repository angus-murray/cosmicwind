import { expect, test } from 'bun:test';
import { deleteMembersAndFreeNodes, intersectMembers, mergeMembers, moveSelection, expandCombo, comboIncludes, emptyModel, normalise, releaseCode, restraintCode, type Member, type Model } from './types';

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

test('colinear members in a chain merge into one, and their loads move with them', () => {
  const f = frame(), m0: Model = { ...f, distLoads: [{ lc: 1, member: 2, axes: 'G', dir: 'Y', w1: -5, w2: -5, s: 0, e: 100 }], pointLoads: [{ lc: 1, member: 3, axes: 'G', dir: 'Y', p: -10, pos: 50 }], nodeLoads: [] };
  const r = mergeMembers(m0, new Set([1, 2, 3]));
  if (!('model' in r)) throw new Error(r.reason);
  expect(r.kept).toBe(1);
  expect(r.model.members.map(b => [b.id, b.a, b.b])).toEqual([[1, 1, 4]]);
  expect(r.model.nodes.map(n => n.id)).toEqual([1, 4]);
  expect(r.model.distLoads[0]).toMatchObject({ member: 1, s: 33.333333, e: 66.666667 });
  expect(r.model.pointLoads[0]).toMatchObject({ member: 1, pos: 83.333333 });
});

test('members do not merge across a node with another member, a load, or a bend', () => {
  const f = frame();
  expect('reason' in mergeMembers({ ...f, members: [...f.members, mem(4, 2, 4)] }, new Set([1, 2]))).toBe(true);
  expect('reason' in mergeMembers(f, new Set([1, 2, 3]))).toBe(false);
  expect('reason' in mergeMembers({ ...f, nodeLoads: [{ lc: 1, node: 2, fx: 0, fy: -1, fz: 0, mx: 0, my: 0, mz: 0 }] }, new Set([1, 2]))).toBe(true);
  expect('reason' in mergeMembers({ ...f, nodes: f.nodes.map(n => (n.id === 2 ? { ...n, y: 1 } : n)) }, new Set([1, 2]))).toBe(true);
});

test('crossing members are split at a new node, and their loads stay with their parts', () => {
  const m0: Model = {
    ...emptyModel(),
    nodes: [{ id: 1, x: 0, y: 0, z: 0, r: 'RRRRRR' }, { id: 2, x: 4, y: 0, z: 0, r: 'RRRRRR' }, { id: 3, x: 2, y: -1, z: 0, r: 'RRRRRR' }, { id: 4, x: 2, y: 1, z: 0, r: 'RRRRRR' }],
    members: [mem(1, 1, 2), mem(2, 3, 4)],
    distLoads: [{ lc: 1, member: 1, axes: 'G', dir: 'Y', w1: -5, w2: -5, s: 25, e: 75 }],
    pointLoads: [{ lc: 1, member: 1, axes: 'G', dir: 'Y', p: -10, pos: 25 }],
  };
  const r = intersectMembers(m0, new Set([1, 2]));
  if (!r) throw new Error('no crossing found');
  expect(r.model.nodes.length).toBe(5);
  expect(r.model.nodes[4]).toMatchObject({ x: 2, y: 0, z: 0 });
  expect(r.model.members.map(b => [b.id, b.a, b.b])).toEqual([[1, 1, 5], [2, 3, 5], [3, 5, 2], [4, 5, 4]]);
  expect(r.model.distLoads).toMatchObject([{ member: 1, s: 50, e: 100 }, { member: 3, s: 0, e: 50 }]);
  expect(r.model.pointLoads).toMatchObject([{ member: 1, pos: 50 }]);
});

test('a member ending on another splits it at the existing node; skew and parallel members do not intersect', () => {
  const f = frame(), t: Model = { ...f, nodes: [...f.nodes, { id: 5, x: 2, y: 3, z: 0, r: 'RRRRRR' }], members: [mem(1, 1, 4), mem(2, 2, 5)] };
  const r = intersectMembers(t, new Set([1, 2]));
  expect(r?.model.members.map(b => [b.a, b.b])).toEqual([[1, 2], [2, 5], [2, 4]]);
  expect(r?.model.nodes.length).toBe(5);
  const skew: Model = { ...t, nodes: t.nodes.map(n => (n.id === 5 ? { ...n, z: 1 } : n.id === 2 ? { ...n, y: -1 } : n)) };
  expect(intersectMembers(skew, new Set([1, 2]))).toBeNull();
  expect(intersectMembers(frame(), new Set([1, 2]))).toBeNull();
});

test('moving a member leaves a node shared with an unselected member, and joins the member to a new node', () => {
  const m = moveSelection(frame(), new Set(), new Set([2]), n => [n.x, n.y + 5, n.z]);
  expect(m.nodes.map(n => [n.id, n.y])).toEqual([[1, 0], [2, 0], [3, 0], [4, 0], [5, 5], [6, 5]]);
  expect(m.members.map(b => [b.id, b.a, b.b])).toEqual([[1, 1, 2], [2, 5, 6], [3, 3, 4]]);
});

test('members that share nodes only with each other move together, and an end node that is used by nothing else moves in place', () => {
  const m = moveSelection(frame(), new Set(), new Set([1, 2]), n => [n.x, n.y + 5, n.z]);
  expect(m.nodes.map(n => [n.id, n.y])).toEqual([[1, 5], [2, 5], [3, 0], [4, 0], [5, 5]]);
  expect(m.members.map(b => [b.id, b.a, b.b])).toEqual([[1, 1, 2], [2, 2, 5], [3, 3, 4]]);
});

test('a selected node moves in place with every member attached to it', () => {
  const m = moveSelection(frame(), new Set([2]), new Set(), n => [n.x, n.y + 5, n.z]);
  expect(m.nodes.map(n => [n.id, n.y])).toEqual([[1, 0], [2, 5], [3, 0], [4, 0]]);
  expect(m.members.map(b => [b.a, b.b])).toEqual([[1, 2], [2, 3], [3, 4]]);
});

test('a combination can include other combinations, and a loop is not allowed', () => {
  const m: Model = { ...emptyModel(), loadCases: [{ id: 1, name: 'A', gx: 0, gy: 0, gz: 0 }, { id: 2, name: 'B', gx: 0, gy: 0, gz: 0 }],
    combos: [{ id: 10, name: 'C10', f: { 1: 1.2, 2: 1.5 } }, { id: 11, name: 'C11', f: { 10: 2, 1: 1 } }, { id: 12, name: 'C12', f: { 11: 1, 2: -1 } }] };
  expect([...expandCombo(m, 10)]).toEqual([[1, 1.2], [2, 1.5]]);
  const e11 = expandCombo(m, 11); expect(e11.get(1)).toBeCloseTo(3.4); expect(e11.get(2)).toBeCloseTo(3);
  const e12 = expandCombo(m, 12); expect(e12.get(1)).toBeCloseTo(3.4); expect(e12.get(2)).toBeCloseTo(2);
  expect(comboIncludes(m, 12, 10)).toBe(true);
  expect(comboIncludes(m, 10, 12)).toBe(false);
  // a loop in a file is cut where it comes back to a combination being expanded
  const loop: Model = { ...m, combos: [{ id: 10, name: 'C10', f: { 1: 1, 12: 1 } }, ...m.combos.slice(1)] };
  const eloop = expandCombo(loop, 10); expect(eloop.get(1)).toBeCloseTo(2); expect(eloop.get(2)).toBeCloseTo(-1);
});
