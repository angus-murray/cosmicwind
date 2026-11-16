# CosmicWind

Structural analysis app; follows the `engineering-ui` house style (`node_modules/engineering-ui/STYLE.md`).

## Deliberate deviations from the house style

- The input column is one third of the width (at least 600 px) instead of one quarter, so that the datasheet headings of the Loads tab fit on one line. The canvas has the rest; the load case is chosen in the canvas.
- Model data is entered in datasheets (`.sheet` in `src/index.css`, `src/ui/Sheet.tsx`) and not in `NumberField`
  controls. Cells commit on Enter or blur and accept a block pasted from a spreadsheet.
- There is no Solve button: the analysis runs when the Analysis and Results tab is open and the model changes.
- The PDF report uses the built-in Helvetica font and `jspdf-autotable`, so it avoids symbols outside Latin-1.

## Conventions

- Units: the model is stored in m, kN, kNm, t; section properties and settlements in mm units; E and G in MPa; density in kg/m³. Global Y is vertical.
- Display units (`src/model/units.ts`, chosen in the bar at the bottom of the canvas) only change what is shown and typed. Any new number field, label or report column needs a `Quantity` (for a datasheet column, `q` in `Col`) so that it converts; never hard-code a unit in the UI.
- A member may carry a continuous support (`ky`, `kz`, kN/m per m, local y and z). The solver lumps it to the end nodes of each member (k L / 2 each), so subdivide members for a close match to a bed of springs.
- The solver works in kN, m and t. Every solver change needs a test in `src/solver/frame.test.ts` against a
  closed-form or refined-model result.
- Run `bun run check`, `bun test` and `bun run build` before committing.
