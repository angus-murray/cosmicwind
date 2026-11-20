# CosmicWind

Structural analysis app; follows the `engineering-ui` house style (`node_modules/engineering-ui/STYLE.md`).

## Deliberate deviations from the house style

- The input column is one third of the width (at least 600 px) instead of one quarter, so that the datasheet headings of the Loads tab fit on one line. The canvas has the rest; the load case is chosen in the canvas.
- Model data is entered in datasheets (`.sheet` in `src/index.css`, `src/ui/Sheet.tsx`) and not in `NumberField`
  controls. Cells commit on Enter or blur and accept a block pasted from a spreadsheet.
- The left-hand menu is one panel with two tabs attached along its top (`src/ui/Tree.tsx`, with the `.tree-*` classes in `src/index.css`): Model, and Analysis and Results. Both tabs are lists of headings (Structure, Boundary Conditions and Loads; Analysis and Results, Static Results and Modal Results) that do not collapse, and each item under a heading has an icon (the same Lucide icons as the toolbar where there is one) and opens as a drop-down in place. Several can be open at once. The classes use only house-style tokens and are intended to move into `engineering-ui`.
- Boundary Conditions (Node Restraints, Member Releases, Member Supports) are stored on the nodes and members, and each datasheet lists only the nodes or members that have one, so the Nodes and Members tables stay narrow.
- Selecting a row in the Nodes or Members datasheet selects the same element on the canvas, and selecting on the canvas opens the datasheet and scrolls to the row. Clicking the number of a section or material lets the user change it, to a number that no other section or material has, and the members that use it follow.
- A datasheet shows about ten rows (300 px) and scrolls within itself beyond that, so a long table does not push the other items of the tree out of view.
- Datasheets use a fixed layout: columns share the width equally (a text column takes more, or a `weight` on the column), so the same kind of column has the same width everywhere. The input column is a quarter of the width, at least 500 px.
- On the Analysis and Results tab the Static Results (Deflections, Diagrams, Reactions, Stresses) are drawn on the Undeformed or the Deformed geometry (`opts.geometry`), never both. In the Viewer the deformed geometry is the model with displaced nodes and bent members, so loads, diagrams, reactions and stress colours follow it. Buckling and Vibration (Modal Results) ignore the choice and draw their own shape. A member's cross section in the deformed view is turned by the rotations of the member at that station (`rx`, `ry`, `rz` in `MemberResult`), so it stays square to the drawn axis, stays level where the member is fixed and turns with the node at a rigid joint.
- There is no Solve button: the analysis runs while the Analysis and Results tab is shown, and the model changes. On that tab the model is shown with its results and the drawing tools are hidden.
- The PDF Report button is removed from the header for now (`src/report.ts` is kept, not reachable from the UI). The report uses the built-in Helvetica font and `jspdf-autotable`, so it avoids symbols outside Latin-1.

## Conventions

- Units: the model is stored in m, kN, kNm, t; section properties and settlements in mm units; E and G in MPa; density in kg/m³. Global Y is vertical.
- Display units (`src/model/units.ts`, chosen in the bar at the bottom of the canvas) only change what is shown and typed. Any new number field, label or report column needs a `Quantity` (for a datasheet column, `q` in `Col`) so that it converts; never hard-code a unit in the UI.
- A member may carry a continuous support (`ky`, `kz`, kN/m per m, local y and z). The solver gives each member the consistent support matrix (∫ k Nᵀ N dx with the beam's cubic shape functions, `winkler` in `src/solver/frame.ts`, condensed with the member's releases), and the shear and moment diagrams include the support's distributed reaction, so a uniform load on a free beam gives exactly q/k with no bending and results converge at O(h⁴).
- A combination may include load cases and other combinations (`expandCombo` in `src/model/types.ts` flattens them; a combination cannot include itself or one that includes it). Load cases and combinations share one set of numbers, and clicking a number in their datasheets renumbers it everywhere it is used.
- Node masses (`model.masses`, tonnes) are loaded by gravity as well as adding mass to the vibration modes: in a load case with gravity multipliers each gives a force of mass × g × multiplier at its node, so combinations scale it with the case. The canvas marks a node with a mass by a solid ball (`opts.masses`, the Masses button of the view toolbar), not by a force arrow.
- A member may carry a distributed mass `mu` (t/m) on top of its section's mass. It weighs under gravity as a distributed load (like the self-weight), and every member's mass, the section's and the added, is spread along it by a consistent mass matrix in the vibration analysis (`consistentMass` in `src/solver/frame.ts`: cubic in bending, linear axially and in twist, condensed with the member's releases), assembled into a matrix with the profile of the stiffness matrix. Node masses are added on the diagonal. Mass never gives rotary inertia to bending.
- The solver works in kN, m and t. Every solver change needs a test in `src/solver/frame.test.ts` against a
  closed-form or refined-model result.
- `src/solver/benchmarks.test.ts` (see `BENCHMARKS.md`) checks the solver against closed-form results. A failure is a defect to explain, not a tolerance to widen; add a benchmark for any new analysis feature.
- Run `bun run check`, `bun test` and `bun run build` before committing.
