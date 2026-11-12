# CosmicWind

Three-dimensional frame and truss analysis in the browser. The model is built in datasheets or drawn in the graphics
window and is solved on the user's computer; nothing is sent to a server.

## Features

- Nodes, members, sections, materials, restraints, spring supports and member end releases.
- Section library (universal beams and columns, parallel flange channels, hollow sections, equal angles) and
  sections from a shape; material presets.
- Load cases with self-weight, node loads, distributed and point member loads (global or local axes), support
  settlements and temperature loads; combination cases.
- Linear static analysis, second-order (P-Δ) analysis, tension-only and compression-only members, elastic critical
  buckling and natural frequencies.
- Graphics: wireframe or rendered 3D view of the member cross sections; left-drag selection box, middle-drag rotate,
  right-drag pan, scroll zoom and right-click menus for nodes and members; draw nodes and members on a working plane;
  loads, reactions, deflected shape, action diagrams and mode shapes.
- Results tables, diagrams along a member, PDF report, model saved to and opened from a JSON file, undo and redo.
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
