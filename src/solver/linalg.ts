/** Symmetric positive-definite matrix in skyline (profile) storage, with LDLᵀ factorisation. */
export class Skyline {
  readonly n: number;
  /** First stored row of each column. */
  readonly first: Int32Array;
  private ptr: Int32Array;
  a: Float64Array;
  factored = false;

  constructor(first: Int32Array) {
    this.n = first.length; this.first = first;
    this.ptr = new Int32Array(this.n + 1);
    for (let j = 0; j < this.n; j++) this.ptr[j + 1] = this.ptr[j] + (j - first[j] + 1);
    this.a = new Float64Array(this.ptr[this.n]);
  }
  clone(): Skyline { const s = new Skyline(this.first); s.a.set(this.a); return s; }
  add(i: number, j: number, v: number) { if (i > j) { const t = i; i = j; j = t; } this.a[this.ptr[j] + i - this.first[j]] += v; }
  diag(j: number) { return this.a[this.ptr[j + 1] - 1]; }
  setDiag(j: number, v: number) { this.a[this.ptr[j + 1] - 1] = v; }

  /** y = A x (unfactored matrix). */
  mul(x: Float64Array): Float64Array {
    const { n, first, ptr, a } = this, y = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      const p = ptr[j] - first[j]; let s = 0; const xj = x[j];
      for (let i = first[j]; i < j; i++) { const v = a[p + i]; s += v * x[i]; y[i] += v * xj; }
      y[j] += s + a[p + j] * xj;
    }
    return y;
  }

  /**
   * In-place LDLᵀ. Returns the index of the first pivot that is not positive (relative to its original diagonal),
   * or −1 when the matrix is positive definite.
   */
  factor(tol = 1e-10): number {
    const { n, first, ptr, a } = this; let bad = -1;
    for (let j = 0; j < n; j++) {
      const mj = first[j], pj = ptr[j] - mj, d0 = a[pj + j];
      for (let i = mj + 1; i < j; i++) {
        const mi = first[i], pi = ptr[i] - mi; let s = 0;
        for (let r = Math.max(mi, mj); r < i; r++) s += a[pi + r] * a[pj + r];
        a[pj + i] -= s;
      }
      let d = d0;
      for (let r = mj; r < j; r++) { const g = a[pj + r], l = g / a[ptr[r + 1] - 1]; d -= l * g; a[pj + r] = l; }
      if (!(d > tol * Math.abs(d0)) && bad < 0) bad = j;
      if (d === 0 || Number.isNaN(d)) d = 1e-30;
      a[pj + j] = d;
    }
    this.factored = true;
    return bad;
  }

  /** Solves A x = b in place (after factor). */
  solve(b: Float64Array): Float64Array {
    const { n, first, ptr, a } = this;
    for (let j = 0; j < n; j++) { const p = ptr[j] - first[j]; let s = 0; for (let r = first[j]; r < j; r++) s += a[p + r] * b[r]; b[j] -= s; }
    for (let j = 0; j < n; j++) b[j] /= a[ptr[j + 1] - 1];
    for (let j = n - 1; j >= 0; j--) { const p = ptr[j] - first[j], bj = b[j]; if (bj !== 0) for (let r = first[j]; r < j; r++) b[r] -= a[p + r] * bj; }
    return b;
  }
}

/** Eigenvalues and eigenvectors (columns of V) of a small dense symmetric matrix, by cyclic Jacobi rotations. */
export function jacobi(A: number[][]): { values: number[]; V: number[][] } {
  const n = A.length, a = A.map(r => r.slice()), V: number[][] = a.map((_, i) => a.map((__, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0, dia = 0;
    for (let i = 0; i < n; i++) { dia += a[i][i] ** 2; for (let j = i + 1; j < n; j++) off += a[i][j] ** 2; }
    if (off <= 1e-28 * (dia + off) || off === 0) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (a[p][q] === 0) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const x = a[k][p], y = a[k][q]; a[k][p] = c * x - s * y; a[k][q] = s * x + c * y; }
      for (let k = 0; k < n; k++) { const x = a[p][k], y = a[q][k]; a[p][k] = c * x - s * y; a[q][k] = s * x + c * y; }
      for (let k = 0; k < n; k++) { const x = V[k][p], y = V[k][q]; V[k][p] = c * x - s * y; V[k][q] = s * x + c * y; }
    }
  }
  return { values: a.map((r, i) => r[i]), V };
}

const dot = (a: Float64Array, b: Float64Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

/**
 * Lowest positive eigenvalues of K φ = λ B φ by subspace iteration. K is factored; B is symmetric (it may be
 * indefinite or singular) and given by its product with a vector.
 */
export function subspace(K: Skyline, mulB: (x: Float64Array) => Float64Array, want: number, maxIter = 80): { values: number[]; vectors: Float64Array[] } {
  const n = K.n; if (n === 0 || want <= 0) return { values: [], vectors: [] };
  let q = Math.min(n, 2 * want + 8), seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) - 0.5;
  let X: Float64Array[] = Array.from({ length: q }, (_, k) => Float64Array.from({ length: n }, () => (k === 0 ? 1 : rnd())));
  let prev: number[] = [], values: number[] = [];
  for (let it = 0; it < maxIter; it++) {
    // X̄ = K⁻¹ B X, kept with KX̄ = B X; orthogonalised together so the reduced K stays well conditioned.
    let KX = X.map(mulB), Xb = KX.map(y => K.solve(y.slice()));
    const keepX: Float64Array[] = [], keepK: Float64Array[] = [];
    for (let j = 0; j < Xb.length; j++) {
      const x = Xb[j], kx = KX[j], n0 = Math.sqrt(dot(x, x));
      for (let i = 0; i < keepX.length; i++) { const c = dot(keepX[i], x); for (let k = 0; k < n; k++) { x[k] -= c * keepX[i][k]; kx[k] -= c * keepK[i][k]; } }
      const n1 = Math.sqrt(dot(x, x));
      if (!(n1 > 1e-9 * n0) || n1 === 0) continue;
      for (let k = 0; k < n; k++) { x[k] /= n1; kx[k] /= n1; }
      keepX.push(x); keepK.push(kx);
    }
    Xb = keepX; KX = keepK; q = Xb.length; if (q === 0) return { values: [], vectors: [] };
    const BX = Xb.map(mulB);
    const Kr = Xb.map((xi, i) => KX.map((kx, j) => (dot(xi, kx) + dot(Xb[j], KX[i])) / 2));
    const Br = Xb.map((xi, i) => BX.map((bx, j) => (dot(xi, bx) + dot(Xb[j], BX[i])) / 2));
    // Kr = L Lᵀ; C = L⁻¹ Br L⁻ᵀ; C y = μ y with μ = 1/λ.
    const L = Kr.map(r => r.map(() => 0));
    for (let i = 0; i < q; i++) for (let j = 0; j <= i; j++) {
      let s = Kr[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      L[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-300)) : s / L[j][j];
    }
    const fwd = (M: number[][]) => { // L⁻¹ M
      const R = M.map(r => r.slice());
      for (let c = 0; c < q; c++) for (let i = 0; i < q; i++) { let s = R[i][c]; for (let k = 0; k < i; k++) s -= L[i][k] * R[k][c]; R[i][c] = s / L[i][i]; }
      return R;
    };
    const T1 = fwd(Br), C = fwd(T1[0].map((_, c) => T1.map(r => r[c])));   // L⁻¹ (L⁻¹ Br)ᵀ
    const { values: mu, V } = jacobi(C.map((r, i) => r.map((v, j) => (v + C[j][i]) / 2)));
    const order = mu.map((_, i) => i).sort((a, b) => mu[b] - mu[a]);
    const Q = order.map(o => { // back-substitute Lᵀ q = y
      const y = V.map(r => r[o]);
      for (let i = q - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < q; k++) s -= L[k][i] * y[k]; y[i] = s / L[i][i]; }
      return y;
    });
    X = Q.map(qv => { const x = new Float64Array(n); for (let j = 0; j < q; j++) { const c = qv[j], xj = Xb[j]; for (let k = 0; k < n; k++) x[k] += c * xj[k]; } return x; });
    values = order.map(o => (mu[o] > 1e-14 ? 1 / mu[o] : Infinity));
    const m = Math.min(want, q);
    if (prev.length >= m && values.slice(0, m).every((v, i) => !isFinite(v) || Math.abs(v - prev[i]) <= 1e-9 * Math.abs(v))) break;
    prev = values;
  }
  const keep = values.map((v, i) => i).filter(i => isFinite(values[i])).slice(0, want);
  return { values: keep.map(i => values[i]), vectors: keep.map(i => X[i]) };
}
