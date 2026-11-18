# CosmicWind

Structural analysis app; follows the `engineering-ui` house style (`node_modules/engineering-ui/STYLE.md`).

## Deliberate deviations from the house style

- The input column is one third of the width (at least 600 px) instead of one quarter, so that the datasheet headings of the Loads tab fit on one line. The canvas has the rest; the load case is chosen in the canvas.
- Model data is entered in datasheets (`.sheet` in `src/index.css`, `src/ui/Sheet.tsx`) and not in `NumberField`
  controls. Cells commit on Enter or blur and accept a block pasted from a spreadsheet.
- The input column is a tree of panels (`src/ui/Tree.tsx`, with the `.tree-*` classes in `src/index.css`) and not tabs: Structure, Boundary Conditions, Loads, and Analysis and Results are panels, and each item in them opens as a drop-down in place. Several can be open at once. The classes use only house-style tokens and are intended to move into `engineering-ui`.
- Boundary Conditions (Node Restraints, Member Releases, Member Supports) are stored on the nodes and members, and each datasheet lists only the nodes or members that have one, so the Nodes and Members tables stay narrow.
- Selecting a row in the Nodes or Members datasheet selects the same element on the canvas, and selecting on the canvas opens the datasheet and scrolls to the row. Clicking the number of a section or material selects the members that use it.
- Datasheets use a fixed layout: columns share the width equally (a text column takes more, or a `weight` on the column), so the same kind of column has the same width everywhere. The input column is a quarter of the width, at least 500 px.
- There is no Solve button: the analysis runs while any item of Analysis and Results is open, and the model changes. While one is open the model is shown with its results and the drawing tools are hidden.
- The PDF report uses the built-in Helvetica font and `jspdf-autotable`, so it avoids symbols outside Latin-1.

## Conventions

- Units: the model is stored in m, kN, kNm, t; section properties and settlements in mm units; E and G in MPa; density in kg/m³. Global Y is vertical.
- Display units (`src/model/units.ts`, chosen in the bar at the bottom of the canvas) only change what is shown and typed. Any new number field, label or report column needs a `Quantity` (for a datasheet column, `q` in `Col`) so that it converts; never hard-code a unit in the UI.
- A member may carry a continuous support (`ky`, `kz`, kN/m per m, local y and z). The solver lumps it to the end nodes of each member (k L / 2 each), so subdivide members for a close match to a bed of springs.
- The solver works in kN, m and t. Every solver change needs a test in `src/solver/frame.test.ts` against a
  closed-form or refined-model result.
- Run `bun run check`, `bun test` and `bun run build` before committing.
