# CosmicWind

Structural analysis app; follows the `engineering-ui` house style (`node_modules/engineering-ui/STYLE.md`).

## Deliberate deviations from the house style

- The input column is one third of the width (at least 600 px) instead of one quarter, so that the datasheet headings of the Loads tab fit on one line. The canvas has the rest; the load case is chosen in the canvas.
- Model data is entered in datasheets (`.sheet` in `src/index.css`, `src/ui/Sheet.tsx`) and not in `NumberField`
  controls. Cells commit on Enter or blur and accept a block pasted from a spreadsheet.
- There is no Solve button: the analysis runs when the Analysis and Results tab is open and the model changes.
- The PDF report uses the built-in Helvetica font and `jspdf-autotable`, so it avoids symbols outside Latin-1.

## Conventions

- Units: m, kN, kNm; section properties in mm units; E and G in MPa. Global Y is vertical.
- The solver works in kN, m and t. Every solver change needs a test in `src/solver/frame.test.ts` against a
  closed-form or refined-model result.
- Run `bun run check`, `bun test` and `bun run build` before committing.
