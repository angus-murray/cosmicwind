import { G0 } from '../solver/frame';
import { Children, useState } from 'react';
import { AboutModal, CollapsePanel, Formula, Modal, NumberField, Segmented, SelectField } from 'engineering-ui';
import { RELEASE_DATE, VERSION } from '../version';
import { LIB_GROUPS, LIBRARY, SHAPES, shapeName, shapeProps, type Outline, type Props, type Shape } from '../model/sections';
import { sym } from './Sym';
import type { Axes, Dir, PointDir } from '../model/types';
import { useUnits } from '../model/units';

const sci = (v: number) => (v >= 1e6 ? `${(v / 1e6).toPrecision(4)} × 10⁶` : v.toPrecision(4));
export function SectionDialog({ onClose, onAdd, assign, replace }: { onClose: () => void; onAdd: (name: string, p: Props, outline: Outline) => void; assign: number; /** Section number whose type is being changed. */ replace?: number }) {
  const { show, read, label } = useUnits();
  const [mode, setMode] = useState<'lib' | 'shape'>('lib');
  const [group, setGroup] = useState(LIB_GROUPS[0]);
  const [shape, setShape] = useState<Shape>('rect');
  const [dims, setDims] = useState<number[]>([600, 300, 20, 12]);
  const sh = SHAPES.find(s => s.value === shape)!, d = dims.slice(0, sh.dims.length), props = shapeProps(shape, d);
  const valid = Object.values(props).every(v => isFinite(v) && v > 0);
  return (
    <Modal title={replace ? `Change Type of Section ${replace}` : 'Add Section'} onClose={onClose} variant="dialog">
      <div className="space-y-3">
        <Segmented value={mode} onChange={setMode} options={[{ value: 'lib', label: 'Library' }, { value: 'shape', label: 'Shape' }]} />
        {mode === 'lib' ? <>
          <SelectField label="Group" value={group} onChange={setGroup} options={LIB_GROUPS.map(g => ({ value: g, label: g }))} />
          <div className="max-h-72 overflow-auto scroll-thin border border-slate-200 rounded">
            <table className="rtable">
              <thead className="sticky top-0"><tr><th>Section</th><th><i>A</i> ({label('area')})</th><th><i>I</i><sub>z</sub> ({label('inertia')})</th><th><i>I</i><sub>y</sub> ({label('inertia')})</th></tr></thead>
              <tbody>{LIBRARY.filter(s => s.group === group).map(s => <tr key={s.name} className="cursor-pointer" onClick={() => onAdd(s.name, s, s.outline)}><td className="font-medium">{s.name}</td><td>{sci(show('area', s.A))}</td><td>{sci(show('inertia', s.Iz))}</td><td>{sci(show('inertia', s.Iy))}</td></tr>)}</tbody>
            </table>
          </div>
        </> : <>
          <SelectField label="Shape" value={shape} onChange={v => setShape(v as Shape)} options={SHAPES.map(s => ({ value: s.value, label: s.label }))} />
          <div className="grid grid-cols-2 gap-2">{sh.dims.map((l, i) => <NumberField key={l} label={`${l} (${label('lengthMm')})`} value={show('lengthMm', dims[i])} min={show('lengthMm', 0.1)} step={show('lengthMm', 10)} onChange={v => setDims(dims.map((x, k) => (k === i ? read('lengthMm', v) : x)))} />)}</div>
          <div className="section space-y-1">
            {valid ? ([['Area', props.A, 'area'], ['Iz', props.Iz, 'inertia'], ['Iy', props.Iy, 'inertia'], ['J', props.J, 'inertia']] as const).map(([l, v, u]) =>
              <div key={l} className="readout"><span>{l.length === 2 || l === 'J' ? <><i>{l[0]}</i><sub>{l.slice(1)}</sub></> : l} ({label(u)})</span><span className="readout-value">{sci(show(u, v))}</span></div>)
              : <p className="text-[11px] text-rose-700">The dimensions do not make a valid section.</p>}
          </div>
          <div className="flex justify-end"><button className="btn-primary" disabled={!valid} onClick={() => onAdd(shapeName(shape, d), props, { shape, dims: d })}>{replace ? 'Change Type' : 'Add Section'}</button></div>
        </>}
        {assign > 0 && <p className="text-[11px] text-slate-500">The section will be assigned to the {assign} selected member{assign > 1 ? 's' : ''}.</p>}
      </div>
    </Modal>
  );
}

export function About({ onClose }: { onClose: () => void }) {
  const P = ({ children }: { children: React.ReactNode }) => <p className="text-xs text-slate-700 leading-relaxed select-text">{Children.map(children, c => (typeof c === 'string' ? sym(c) : c))}</p>;
  return (
    <AboutModal name="CosmicWind" version={VERSION} date={RELEASE_DATE} onClose={onClose}>
      <CollapsePanel title="Overview" defaultOpen><P>CosmicWind analyses three-dimensional frames and trusses in the browser. The model is built in datasheets or drawn in the
        graphics window, and is solved by the direct stiffness method for load cases and combinations. Inputs and datasheets are in the tree on the left and the
        graphics window is on the right. Everything runs on the user's computer; the model is kept in the browser's storage and can be saved to and opened
        from a file. New starts a blank model, and Undo brings the previous one back.</P></CollapsePanel>
      <CollapsePanel title="Units and Axes">
        <P>The units are chosen with the controls at the bottom of the graphics window (length in mm or m, force in N, kN or MN, stress in Pa, kPa or MPa, mass in kg or t, temperature in C or K) or with the SI, N.mm and kN.m presets. Time is always in seconds. Changing the units changes only how values are shown and typed; the model and its forces are not altered. Global Y is
          vertical. A member's local x axis runs from end 1 to end 2. For a member that is not vertical, the local y axis lies in the vertical plane
          through the member and points upward, and the local z axis is horizontal. For a vertical member the local z axis is parallel to global Z. The
          Angle column rotates the y and z axes about the member, and can also be set from the right-click menu of a member. <i>I</i><sub>z</sub> is the second
          moment about the local z axis, the major axis of a beam in its usual orientation. Global axes are always written in upper case (X, Y, Z) and local
          axes in lower case (x, y, z), including in the direction of a member load, which shows x, y, z when the load is in local axes.</P>
        <P>Restraint codes have six characters for DX, DY, DZ, RX, RY and RZ: F is fixed, R is released and S is a spring. Click the arrow in a Restraint or
          Release cell to set each degree of freedom and the stiffness of its spring (force per length for a displacement or axial force, force times length per radian for a rotation or
          moment). Member end releases use the same form for the three local forces and three local moments at each end, but there are no springs on the
          two shear forces. Restraints and releases can also be set from the right-click menu of a node or member. Loads are positive in the positive axis
          direction, so a downward load is negative in Y. Moments follow the right-hand rule and are drawn as double-headed arrows.</P>
        <P>The Gravity columns of a load case are multipliers of <i>g</i>, where <i>g</i> = {G0} m/s², the standard gravitational acceleration. The self-weight
          of a member is its density times its cross-sectional area times <i>g</i>, applied along its length, and node masses and member masses for vibration
          modes are in the mass unit chosen.</P>
      </CollapsePanel>
      <CollapsePanel title="Using the Program">
        <P>The input column has two tabs. The Model tab lists Structure, which holds the datasheets for nodes, members, sections, materials and node masses. Boundary Conditions
          holds node restraints, member releases and continuous member supports, each listing only the nodes or members that have one. Loads holds
          load cases, combinations, node loads, distributed and point member loads, support settlements and temperature loads. Clicking an item opens its
          datasheet or options in place, and several can stay open together. Selecting a row in the Nodes or Members datasheet selects the same node or
          member in the graphics window, and selecting in the graphics window opens the datasheet at its row. The number of a section or material can be
          changed by clicking it, to any number that is not already used. The Analysis and Results tab solves the model while it is shown and
          controls what is drawn. The load case or combination shown is chosen in the graphics window, which also shows its gravity load under the selector
          when Loads is on.</P>
        <P>In the graphics window, drag with the left button to rotate, click twice to draw a selection box, use the wheel to zoom, and drag with the right
          button to pan. Dragging with the middle button scales the deformed shape up and down on the Analysis and Results tab. Right-clicking a
          node, a member or empty space gives the actions that apply, such as loads, restraints, releases, section, angle, subdivide, move and copy. The
          buttons at the right of the graphics window switch on the node and member numbers, section names, local axes, the origin, restraints, releases,
          loads and notes. The origin is a snap point while it is switched on.</P>
        <P>Nodes and members are drawn with the Node and Member tools on the XY plane at Z = 0. The pointer snaps to nodes, to member midpoints and to the
          origin, and a member being drawn is held to a global axis when it is within 8 degrees of one (the Z axis only in a view where it can be seen) or when X, Y or Z is typed. A length can be typed for
          the member. The section and material of new members are chosen in the panel that appears when the Member tool is selected.</P>
        <P>On the Analysis and Results tab, the Static Results (Deflections, Diagrams, Reactions and Stresses) are drawn on one geometry at a time, chosen by the
          Geometry control above them: Undeformed, the model as drawn, or Deformed, the model displaced by the analysis. The loads, diagrams, reactions and
          stresses follow the geometry chosen, and the deformed and undeformed shapes are never shown together. The Deflection Scale applies to the Deformed geometry, and
          middle-dragging in the graphics window changes it. Deflections writes the global displacements beside the nodes (X, Y, Z or XYZ, in the length unit), on either
          geometry. Diagrams draws the member actions, and hovering over a member or its diagram gives the values at that point, joined to the
          diagram by a line. Reactions and Stresses are switched on in their own items, and the stress scale is at the top left of the graphics window.
          Modal Results (Buckling and Vibration) give the number of modes to calculate; clicking a mode in the list draws its shape in place of the model, and vibration modes are animated.</P>
      </CollapsePanel>
      <CollapsePanel title="Analysis Method">
        <P>Each member is a prismatic Euler-Bernoulli beam-column element with twelve degrees of freedom: axial, torsion and bending about both
          principal axes. Shear deformation and warping torsion are not included. End releases are applied by static condensation. Member loads are
          converted to fixed-end actions by integrating the cubic shape functions, which is exact for the load types offered. The equations are
          renumbered to reduce the profile and solved by <i>LDL</i><sup>T</sup> factorisation of the skyline matrix.</P>
        <Formula><b>K</b> <b>u</b> = <b>P</b> − <b>P</b><sub>f</sub></Formula>
        <P>Actions along each member are found by statics from the end actions and the loads on the member. Deflections along the member are found by
          integrating the curvature <i>M</i>/<i>EI</i> between the end displacements. A rotational degree of freedom with no stiffness, such as at a
          node joining only pin-ended members, is restrained automatically. A member with torsion released at both ends has no torsional stiffness.</P>
        <P>A spring on a node is added to the stiffness of that degree of freedom. A spring at a member end acts in series with the member: the end
          degree of freedom is condensed together with the spring, so the spring carries the whole end action. Results are reported at 21 stations along each
          member, plus the ends of each load.</P>
        <P>Sign convention for results: axial force is positive in tension; <i>M</i><sub>z</sub> is positive when it causes tension on the negative
          y face (sagging for a beam with y upward); shear is the sum of the forces on the member to the left of the section. Bending moment diagrams
          are drawn on the tension side.</P>
      </CollapsePanel>
      <CollapsePanel title="Second-Order Analysis, Tension-Only and Compression-Only Members">
        <P>With Second-Order (P-Δ) switched on, each case and combination is solved iteratively with the geometric stiffness of every member formed
          from its axial force, until the displacements stop changing. The consistent geometric stiffness includes the effect of member curvature
          (P-δ) approximately; subdividing compression members into two to four parts improves it. Combinations are always solved as their own
          load set and not by superposition.</P>
        <P>A tension-only member is removed when it would carry compression, and a compression-only member when it would carry tension; the
          analysis repeats until the set of active members is stable. A removed member keeps its bending stiffness, so its own transverse loads
          still reach its ends.</P>
      </CollapsePanel>
      <CollapsePanel title="Buckling and Vibration">
        <P>Elastic critical buckling solves the eigenvalue problem below for each case, with the geometric stiffness from that case's axial forces.
          The result is the factor by which the whole case would be multiplied to cause elastic buckling. Members need to be subdivided for the
          higher modes and for members that buckle between their nodes.</P>
        <Formula>(<b>K</b> + <i>λ</i> <b>K</b><sub>g</sub>) <b>φ</b> = 0</Formula>
        <P>Natural frequencies use a lumped mass matrix: half the mass of each member at each of its nodes, plus the node masses entered in the
          Masses datasheet. Rotational inertia is ignored. Members need to be subdivided for the mass distribution along them to be represented.
          Both problems are solved by subspace iteration.</P>
      </CollapsePanel>
      <CollapsePanel title="Section Library">
        <P>The properties of library sections are calculated from the nominal dimensions of the sections, including root fillets and corner radii, and
          agree with the published tables to within about one per cent. The torsion constant is the thin-walled approximation. Properties for
          design should be confirmed against the manufacturer's tables. Any section can be edited in the Sections datasheet.</P>
      </CollapsePanel>
      <CollapsePanel title="Limitations">
        <P>CosmicWind does not include plate or shell elements, cable elements, member offsets, master-slave constraints, moving loads, response spectrum
          or time-history analysis, or member design checks to a standard. Large-displacement effects beyond P-Δ are not modelled. The results
          should be checked independently before they are used for design.</P>
      </CollapsePanel>
      <CollapsePanel title="References">
        <P>McGuire, W., Gallagher, R. H. and Ziemian, R. D., <i>Matrix Structural Analysis</i>, 2nd edition, 2000.</P>
        <P>Bathe, K. J., <i>Finite Element Procedures</i>, 2nd edition, 2014 (skyline solution and subspace iteration).</P>
      </CollapsePanel>
    </AboutModal>
  );
}

export type LoadSpec =
  | { type: 'node'; f: number[] }
  | { type: 'dist'; axes: Axes; dir: Dir; w1: number; w2: number; s: number; e: number }
  | { type: 'point'; axes: Axes; dir: PointDir; p: number; pos: number };

/** Applies a load to the selected nodes or members, in the chosen load case. */
export function LoadDialog({ kind, count, cases, lc0, onClose, onApply }: {
  kind: 'node' | 'member'; count: number; cases: { id: number; name: string }[]; lc0: number; onClose: () => void; onApply: (lc: number, spec: LoadSpec) => void;
}) {
  const { read, label } = useUnits();
  const [lc, setLc] = useState(lc0);
  const [mode, setMode] = useState<'dist' | 'point'>('dist');
  const [axes, setAxes] = useState<Axes>('G');
  const [dir, setDir] = useState<PointDir>('Y');
  // The boxes start empty. A blank load is zero, a blank Start is the start of the member and a blank End is its end; a point load needs its position.
  const [w1, setW1] = useState<number | undefined>(), [w2, setW2] = useState<number | undefined>(), [s0, setS0] = useState<number | undefined>(), [e0, setE0] = useState<number | undefined>();
  const [p, setP] = useState<number | undefined>(), [pos, setPos] = useState<number | undefined>();
  const [f, setF] = useState<(number | undefined)[]>([undefined, undefined, undefined, undefined, undefined, undefined]);
  const dirOpts = (moments: boolean) => { const c = (v: string) => (axes === 'L' ? v.toLowerCase() : v); return [...(['X', 'Y', 'Z'] as const).map(d => ({ value: d, label: moments ? `Force ${c(d)}` : c(d) })), ...(moments ? (['MX', 'MY', 'MZ'] as const).map(d => ({ value: d, label: `Moment ${c(d.slice(1))}` })) : [])]; };
  const ok = kind === 'node' ? f.some(v => !!v) : mode === 'dist' ? (e0 ?? 100) > (s0 ?? 0) && (s0 ?? 0) >= 0 && (e0 ?? 100) <= 100 && (!!w1 || !!w2) : !!p && pos !== undefined && pos >= 0 && pos <= 100;
  const apply = () => onApply(lc, kind === 'node' ? { type: 'node', f: f.map((v, i) => read(i < 3 ? 'force' : 'moment', v ?? 0)) }
    : mode === 'dist' ? { type: 'dist', axes, dir: (['X', 'Y', 'Z'].includes(dir) ? dir : 'Y') as Dir, w1: read('forcePerLength', w1 ?? 0), w2: read('forcePerLength', w2 ?? 0), s: s0 ?? 0, e: e0 ?? 100 } : { type: 'point', axes, dir, p: read(dir.length === 2 ? 'moment' : 'force', p ?? 0), pos: pos ?? 50 });
  return (
    <Modal title={kind === 'node' ? 'Apply Node Load' : 'Apply Member Load'} onClose={onClose} variant="dialog">
      <div className="space-y-3">
        <SelectField label="Load Case" value={String(lc)} onChange={v => setLc(Number(v))} options={cases.map(c => ({ value: String(c.id), label: `${c.id}: ${c.name}` }))} />
        {kind === 'node' ? <div className="grid grid-cols-3 gap-2">
          {['FX', 'FY', 'FZ', 'MX', 'MY', 'MZ'].map((n, i) => `${n} (${label(i < 3 ? 'force' : 'moment')})`).map((l, i) => <NumberField key={l} label={sym(l)} value={f[i]} step={1} onChange={v => setF(f.map((x, k) => (k === i ? v : x)))} onClear={() => setF(f.map((x, k) => (k === i ? undefined : x)))} />)}
        </div> : <>
          <Segmented value={mode} onChange={v => { setMode(v); if (v === 'dist' && ['MX', 'MY', 'MZ'].includes(dir)) setDir('Y'); }} options={[{ value: 'dist', label: 'Distributed' }, { value: 'point', label: 'Point' }]} />
          <div className="grid grid-cols-2 gap-2">
            <SelectField label="Axes" value={axes} onChange={v => setAxes(v as Axes)} options={[{ value: 'G', label: 'Global' }, { value: 'L', label: 'Local' }]} />
            <SelectField label="Direction" value={dir} onChange={v => setDir(v as PointDir)} options={dirOpts(mode === 'point')} />
            {mode === 'dist' ? <>
              <NumberField label={`Start Load (${label('forcePerLength')})`} value={w1} step={1} onChange={setW1} onClear={() => setW1(undefined)} /><NumberField label={`End Load (${label('forcePerLength')})`} value={w2} step={1} onChange={setW2} onClear={() => setW2(undefined)} />
              <NumberField label="Start (%)" value={s0} placeholder="0" min={0} max={100} step={10} onChange={setS0} onClear={() => setS0(undefined)} /><NumberField label="End (%)" value={e0} placeholder="100" min={0} max={100} step={10} onChange={setE0} onClear={() => setE0(undefined)} />
            </> : <>
              <NumberField label={dir.length === 2 ? `Moment (${label('moment')})` : `Force (${label('force')})`} value={p} step={1} onChange={setP} onClear={() => setP(undefined)} /><NumberField label="Position (%)" value={pos} min={0} max={100} step={10} onChange={setPos} onClear={() => setPos(undefined)} />
            </>}
          </div>
        </>}
        <p className="text-[11px] text-slate-500">Applies to the {count} selected {kind}{count > 1 ? 's' : ''}. Negative Y is downward.</p>
        <div className="flex justify-end gap-2"><button className="btn" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!ok} onClick={apply}>Apply Load</button></div>
      </div>
    </Modal>
  );
}
