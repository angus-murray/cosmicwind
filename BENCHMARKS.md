# Verification benchmarks

`src/solver/benchmarks.test.ts` holds 37 tests that compare the solver with closed-form results or independent calculations (never with the solver's own earlier output). Run them with `bun test src/solver`. A discrepancy is a defect to be found, not a tolerance to be widened.

| Area | Reference | Tolerance |
|---|---|---|
| Cantilever (tip load, UDL, tip moment), deflection and rotation | PL³/3EI, wL⁴/8EI, ML²/2EI | 1e-9 |
| Simply supported, fixed-fixed, propped cantilever, two-span beam | Roark Table 8.1; three-moment equation; full deflected shape of the propped beam | 1e-8 to 1e-9 |
| Support settlement, thermal strain, self-weight | 6EIΔ/L², 3EIΔ/L², EAαΔT, ρAg | 1e-9 |
| Trapezoidal and partial loads | Statics, plus double integration of the exact shear | 1e-6 |
| Mesh independence of one member | 3 against 12 elements | 1e-6 |
| Portal sway (fixed and pinned bases) | Slope-deflection solution | 1e-6 |
| 3D L-shaped cantilever (bending and torsion) | P(a³+b³)/3EI + Pab²/GJ | 1e-9 |
| Node springs, member-end springs | Series stiffness; semi-rigid end moment | 1e-9 |
| Continuous support (Winkler) | q/k exactly; Navier series for deflection and moment; Hetényi infinite beam | 1e-9; 5e-5; 2e-4; 5e-3 |
| Global equilibrium of random 3D frames | Reactions against all applied loads, forces and moments | 1e-7 |
| Rotation objectivity, Maxwell-Betti reciprocity | Random rotations; six degree-of-freedom pairs | 1e-7, 1e-9 |
| Tension-only X-brace, pin-jointed truss | Statics; unit-load method | 1e-6 |
| Member angle, 45° bi-axial bending, oblique cantilever | Closed forms | 1e-9 |
| Load combinations (nested) | Linear superposition | 1e-9 |
| Euler buckling (four end conditions, modes 1 to 3) | π²EI/(KL)², K from tan x = x | 1e-3 to 5e-3 |
| Buckling convergence | One element gives 12EI/L² exactly; error falls as h⁴ | ratio above 10 |
| Portal sway buckling | Alignment chart equation x/tan x = −6k, with rigid and soft beam limits | 2e-3 |
| P-Δ beam-column, both principal planes | Secant formula, deflection and moment | 1e-3 to 1e-4 |
| Natural frequencies of beams (four end conditions) | Roots of the frequency equations, solved in the test | 2e-3 to 1e-2 |
| Axial and torsional vibration | (2n−1)c/4L, nc/2L, torsion with polar mass inertia | 1e-3 to 6e-3 |
| Cantilever with tip mass | Transcendental equation, solved in the test | 1e-3 |
| Portal sway frequency | √(K/M)/2π with K from slope-deflection | 1e-6 |
| Consistent mass convergence | Upper bound, error falls as h⁴ | ratio above 10 |
| Stresses (the function that colours the Viewer) | σ = Mc/I with sign checks in both planes; combined N and biaxial M | 1e-9 |
| Shear and moment diagrams | dM/dx = V, dV/dx = −w | 1e-9 |
| Section properties | Closed forms; Saint-Venant series for rectangles; Green's theorem on the drawn outlines | 4e-3 (2.5e-2 for the 24-sided circle) |

## Defect found and fixed

In a second-order (P-Δ) analysis the moment diagram along a member was built from first-order equilibrium of the end forces. It omitted the axial force acting through the member's own lateral deflection, so the moment at the far end of a member differed from the moment at the start of the next member by N × (relative lateral displacement of the two nodes). For an eight-element beam-column at P/Pcr = 0.2 this was 1.5 percent, falling as h². `stations` now adds that term (iterated, because the deflection depends on the moment). The moment is now continuous across nodes to 1e-6 and matches the secant formula in both planes.

## Continuous supports

A continuous support (`ky`, `kz`) used to be lumped to the member ends (kL/2 each) while loads were consistent, which left an O(h²) error (0.24 percent for a uniform load on a free beam with 20 elements). It now has the consistent matrix and its distributed reaction is part of the shear and moment diagrams; a uniform load gives q/k exactly.

## Known approximations (tested and bounded, not hidden)

- Euler-Bernoulli elements: no shear deformation. Deep members are stiffer than a Timoshenko solution.
- Geometric stiffness has the cubic form: buckling and P-Δ converge with refinement. One element gives 12EI/L² (21.6 percent high), eight give 3e-5.
- The mass matrix is consistent for translation, axial and twist, with no bending rotary inertia; frequencies are upper bounds that converge at h⁴.
