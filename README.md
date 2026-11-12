# CosmicWind

Three-dimensional frame and truss analysis in the browser. The model is built in datasheets or drawn in the graphics
window and is solved on the user's computer; nothing is sent to a server.

## Features

- Nodes, members, sections, materials, restraints with springs, and member end releases with axial, torsional and bending springs.
- Section library (universal beams and columns, parallel flange channels, hollow sections, equal angles) and
  sections from a shape; material presets.
- Load cases with gravity, node loads, distributed and point member loads (global or local axes), support
  settlements and temperature loads; combination cases.
- Linear static analysis, second-order (P-Δ) analysis, tension-only and compression-only members, elastic critical
  buckling and natural frequencies.
- Graphics: wireframe or rendered 3D view of the member cross sections; left-drag rotate, two-click selection box,
  scroll zoom, middle-drag to scale the deflected shape (or zoom when none is shown), right-drag pan and right-click menus for nodes and members; draw nodes and members on the XY plane, snapping to nodes and member midpoints;
  loads, reactions, deflected shape, action diagrams (several at once, with resultants) and mode shapes; normal stress coloured on the rendered members.
- Diagrams along a member, buckling and vibration mode lists, PDF report, model saved to and opened from a JSON file, undo and redo.
- Templates: portal frame, multi-storey frame, truss, continuous beam.

Not included: plates and shells, cables, member offsets, master-slave constraints, moving loads, response spectrum
analysis and member design to a standard.

## Development

```bash
bun install
```

```bash
bun run dev
```

```bash
bun test
```

```bash
bun run build
```

`src/solver` holds the analysis (`frame.ts`, `linalg.ts`) and its verification tests against closed-form results;
`src/model` the data model, section library and templates; `src/ui` the datasheets, graphics window, results and
pop-ups. The look and feel comes from `engineering-ui`.
