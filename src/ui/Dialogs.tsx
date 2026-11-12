import { useState } from 'react';
import { CollapsePanel, Formula, Modal, NumberField, Segmented, SelectField } from 'engineering-ui';
import { LIB_GROUPS, LIBRARY, SHAPES, shapeName, shapeProps, type Props, type Shape } from '../model/sections';
import { TEMPLATES } from '../model/templates';
import type { Model } from '../model/types';

export function TemplateDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (m: Model) => void }) {
  const [key, setKey] = useState(TEMPLATES[0].key);
  const t = TEMPLATES.find(x => x.key === key)!;
  const [vals, setVals] = useState<Record<string, number>>({});
  const p = Object.fromEntries(t.params.map(q => [q.key, vals[`${key}.${q.key}`] ?? q.value]));
  return (
    <Modal title="New Model" onClose={onClose} variant="dialog">
      <div className="space-y-3">
        <SelectField label="Template" value={key} onChange={setKey} options={TEMPLATES.map(x => ({ value: x.key, label: x.label }))} />
        <div className="grid grid-cols-2 gap-2">
          {t.params.map(q => <NumberField key={q.key} label={q.label} value={p[q.key]} min={q.min} step={q.step ?? 1} onChange={v => setVals({ ...vals, [`${key}.${q.key}`]: v })} />)}
        </div>
        <div className="flex justify-between gap-2 pt-1">
          <button className="btn" onClick={() => { const m = t.build(p); onCreate({ ...m, title: 'Untitled', nodes: [], members: [], nodeLoads: [], distLoads: [], pointLoads: [] }); }}>Blank Model</button>
          <div className="flex gap-2"><button className="btn" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => onCreate(t.build(p))}>Create</button></div>
        </div>
      </div>
    </Modal>
  );
}

const sci = (v: number) => (v >= 1e6 ? `${(v / 1e6).toPrecision(4)} × 10⁶` : v.toPrecision(4));
export function SectionDialog({ onClose, onAdd, assign }: { onClose: () => void; onAdd: (name: string, p: Props) => void; assign: number }) {
  const [mode, setMode] = useState<'lib' | 'shape'>('lib');
  const [group, setGroup] = useState(LIB_GROUPS[0]);
  const [shape, setShape] = useState<Shape>('rect');
  const [dims, setDims] = useState<number[]>([600, 300, 20, 12]);
  const sh = SHAPES.find(s => s.value === shape)!, d = dims.slice(0, sh.dims.length), props = shapeProps(shape, d);
  const valid = Object.values(props).every(v => isFinite(v) && v > 0);
  return (
    <Modal title="Add Section" onClose={onClose} variant="dialog">
      <div className="space-y-3">
        <Segmented value={mode} onChange={setMode} options={[{ value: 'lib', label: 'Library' }, { value: 'shape', label: 'Shape' }]} />
        {mode === 'lib' ? <>
          <SelectField label="Group" value={group} onChange={setGroup} options={LIB_GROUPS.map(g => ({ value: g, label: g }))} />
          <div className="max-h-72 overflow-auto scroll-thin border border-slate-200 rounded">
            <table className="rtable">
              <thead className="sticky top-0"><tr><th>Section</th><th><i>A</i> (mm²)</th><th><i>I</i><sub>z</sub> (mm⁴)</th><th><i>I</i><sub>y</sub> (mm⁴)</th></tr></thead>
              <tbody>{LIBRARY.filter(s => s.group === group).map(s => <tr key={s.name} className="cursor-pointer" onClick={() => onAdd(s.name, s)}><td className="font-medium">{s.name}</td><td>{s.A.toFixed(0)}</td><td>{sci(s.Iz)}</td><td>{sci(s.Iy)}</td></tr>)}</tbody>
            </table>
          </div>
        </> : <>
          <SelectField label="Shape" value={shape} onChange={v => setShape(v as Shape)} options={SHAPES.map(s => ({ value: s.value, label: s.label }))} />
          <div className="grid grid-cols-2 gap-2">{sh.dims.map((l, i) => <NumberField key={l} label={`${l} (mm)`} value={dims[i]} min={0.1} step={10} onChange={v => setDims(dims.map((x, k) => (k === i ? v : x)))} />)}</div>
          <div className="section space-y-1">
            {valid ? ([['Area', props.A, 'mm²'], ['Iz', props.Iz, 'mm⁴'], ['Iy', props.Iy, 'mm⁴'], ['J', props.J, 'mm⁴']] as const).map(([l, v, u]) =>
              <div key={l} className="readout"><span>{l.length === 2 || l === 'J' ? <><i>{l[0]}</i><sub>{l.slice(1)}</sub></> : l} ({u})</span><span className="readout-value">{sci(v)}</span></div>)
              : <p className="text-[11px] text-rose-700">The dimensions do not make a valid section.</p>}
          </div>
          <div className="flex justify-end"><button className="btn-primary" disabled={!valid} onClick={() => onAdd(shapeName(shape, d), props)}>Add Section</button></div>
        </>}
        {assign > 0 && <p className="text-[11px] text-slate-500">The section will be assigned to the {assign} selected member{assign > 1 ? 's' : ''}.</p>}
      </div>
    </Modal>
  );
}

export function About({ onClose }: { onClose: () => void }) {
  const P = ({ children }: { children: React.ReactNode }) => <p className="text-xs text-slate-700 leading-relaxed">{children}</p>;
  return (
    <Modal title="About MoonRock" onClose={onClose} variant="page">
      <div className="panel"><P>MoonRock analyses three-dimensional frames and trusses in the browser. The model is built in datasheets or drawn in the
        graphics window, and is solved by the direct stiffness method for load cases and combinations. Everything runs on the user's computer; the model
        is kept in the browser's storage and can be saved to and opened from a file.</P></div>
      <CollapsePanel title="Units and Axes" defaultOpen>
        <P>Coordinates are in metres, forces in kN, moments in kNm, section properties in mm units, moduli in MPa and density in kg/m³. Global Y is
          vertical. A member's local x axis runs from node A to node B. For a member that is not vertical, the local y axis lies in the vertical plane
          through the member and points upward, and the local z axis is horizontal. For a vertical member the local z axis is parallel to global Z. The
          Angle column rotates the y and z axes about the member. <i>I</i><sub>z</sub> is the second moment about the local z axis, the major axis of a
          beam in its usual orientation.</P>
        <P>Restraint codes have six characters for DX, DY, DZ, RX, RY and RZ: F is fixed and R is released. Member end releases use the same form
          for the three local forces and three local moments at each end. Loads are positive in the positive axis direction, so a downward load is
          negative in Y. Moments follow the right-hand rule and are drawn as double-headed arrows.</P>
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
      <CollapsePanel title="Buckling and Natural Frequencies">
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
        <P>MoonRock does not include plate or shell elements, cable elements, member offsets, master-slave constraints, moving loads, response spectrum
          or time-history analysis, or member design checks to a standard. Large-displacement effects beyond P-Δ are not modelled. The results
          should be checked independently before they are used for design.</P>
      </CollapsePanel>
      <CollapsePanel title="References">
        <P>McGuire, W., Gallagher, R. H. and Ziemian, R. D., <i>Matrix Structural Analysis</i>, 2nd edition, 2000.</P>
        <P>Bathe, K. J., <i>Finite Element Procedures</i>, 2nd edition, 2014 (skyline solution and subspace iteration).</P>
      </CollapsePanel>
    </Modal>
  );
}
