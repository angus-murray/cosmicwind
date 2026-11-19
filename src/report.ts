import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Member, Model } from './model/types';
import type { Analysis } from './solver/frame';
import { toShown, unitLabelPlain, type Quantity, type Units } from './model/units';

export interface ReportInfo { project: string; number: string; structure: string; designer: string; date: string }
const n = (v: number, d = 2) => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d);
/** A value to five significant figures, in exponent form when very large or small. */
const g = (v: number) => (Math.abs(v) < 1e-12 ? '0' : Math.abs(v) >= 1e7 || Math.abs(v) < 1e-3 ? v.toExponential(3) : String(Number(v.toPrecision(5))));

async function svgImage(svg: SVGSVGElement): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const w = svg.clientWidth, h = svg.clientHeight, clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.querySelectorAll('text').forEach(t => { t.setAttribute('font-family', 'Helvetica, Arial, sans-serif'); t.removeAttribute('style'); });
    clone.querySelectorAll('[style]').forEach(e => { if ((e as SVGElement).style.fill) { e.removeAttribute('style'); e.setAttribute('fill', '#ffffff'); } });
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
    await img.decode();
    const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2;
    const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    return { data: c.toDataURL('image/jpeg', 0.9), w, h };
  } catch { return null; }
}

export async function makeReport(model: Model, an: Analysis, info: ReportInfo, svg: SVGSVGElement | null, units: Units) {
  const sh = (q: Quantity, v: number) => g(toShown(q, units, v)), ul = (q: Quantity) => unitLabelPlain(q, units);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' }), M = 15, W = 210 - 2 * M;
  let y = 20, sec = 0;
  doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(30, 41, 59).text('CosmicWind Analysis Report', M, y); y += 7;
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(100, 116, 139);
  const head = [['Project', info.project], ['Project No.', info.number], ['Structure', info.structure || model.title], ['Designer', info.designer], ['Date', info.date]].filter(r => r[1]);
  head.forEach(([k, v]) => { doc.text(`${k}: ${v}`, M, y); y += 4.5; });
  y += 2;
  const heading = (t: string) => {
    if (y > 262) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(30, 41, 59).text(`${++sec}. ${t}`, M, y);
    doc.setDrawColor(203, 213, 225).line(M, y + 1.5, M + W, y + 1.5); y += 5;
  };
  const table = (h: string[], body: (string | number)[][]) => {
    autoTable(doc, { startY: y, head: [h], body, margin: { left: M, right: M, top: 18 }, theme: 'grid', styles: { fontSize: 7.5, cellPadding: 1, halign: 'center', textColor: [51, 65, 85], lineColor: [226, 232, 240], lineWidth: 0.1 },
      headStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold' } });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  };
  const para = (t: string) => { doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(51, 65, 85); const l = doc.splitTextToSize(t, W); doc.text(l, M, y); y += l.length * 4 + 2; };

  heading('Model');
  para(`${model.nodes.length} nodes, ${model.members.length} members, ${model.loadCases.length} load cases, ${model.combos.length} combinations. Analysis: ${model.settings.nonlinear ? 'second-order (P-Delta)' : 'linear elastic'}. Units: ${units.length}, ${units.force}, ${units.stress}, ${units.mass}, ${units.temp}, s; Y is vertical.`);
  const pic = svg && await svgImage(svg);
  if (pic) { const h = Math.min(W * pic.h / pic.w, 110), w = h * pic.w / pic.h; doc.addImage(pic.data, 'JPEG', M + (W - w) / 2, y, w, h); y += h + 5; }
  /** The sprung degrees of freedom of a code, with their stiffnesses. */
  const springs = (code: string, k: number[] | undefined, names: string[], qs: Quantity[]) => [...(code || '')].map((c, d) => (c === 'S' ? `${names[d]} ${sh(qs[d], k?.[d] ?? 0)} ${ul(qs[d])}` : '')).filter(Boolean).join('; ');
  const dn = ['DX', 'DY', 'DZ', 'RX', 'RY', 'RZ'], du: Quantity[] = ['forcePerLength', 'forcePerLength', 'forcePerLength', 'rotStiffness', 'rotStiffness', 'rotStiffness'], fn = ['Fx', 'Fy', 'Fz', 'Mx', 'My', 'Mz'], fu: Quantity[] = du;
  heading('Nodes');
  const nodeSprings = model.nodes.some(v => v.r.includes('S'));
  table(['Node', `X (${ul('length')})`, `Y (${ul('length')})`, `Z (${ul('length')})`, 'Restraint', ...(nodeSprings ? ['Springs'] : [])], model.nodes.map(v => [v.id, sh('length', v.x), sh('length', v.y), sh('length', v.z), v.r, ...(nodeSprings ? [springs(v.r, v.k, dn, du) || '–'] : [])]));
  heading('Members');
  const mn = new Map(model.materials.map(s => [s.id, s.name]));
  const memSprings = model.members.some(m => m.relA.includes('S') || m.relB.includes('S'));
  const endSprings = (m: Member) => [springs(m.relA, m.kA, fn, fu) && `End 1 ${springs(m.relA, m.kA, fn, fu)}`, springs(m.relB, m.kB, fn, fu) && `End 2 ${springs(m.relB, m.kB, fn, fu)}`].filter(Boolean).join('; ') || '–';
  table(['Member', 'End 1', 'End 2', 'Section No.', 'Material', 'Angle (deg)', 'Type', 'Release 1', 'Release 2', ...(memSprings ? ['Springs'] : [])], model.members.map(m => [m.id, m.a, m.b, m.sec, mn.get(m.mat) ?? m.mat, m.angle, { N: 'Normal', T: 'Tension only', C: 'Compression only' }[m.type], m.relA, m.relB, ...(memSprings ? [endSprings(m)] : [])]));
  if (model.members.some(m => m.ky || m.kz)) {
    heading('Continuous Supports');
    table(['Member', `ky (${ul('forcePerLength2')})`, `kz (${ul('forcePerLength2')})`], model.members.filter(m => m.ky || m.kz).map(m => [m.id, sh('forcePerLength2', m.ky ?? 0), sh('forcePerLength2', m.kz ?? 0)]));
  }
  if (model.members.some(m => m.mu)) {
    heading('Member Masses');
    table(['Member', `Added Mass (${ul('massPerLength')})`], model.members.filter(m => m.mu).map(m => [m.id, sh('massPerLength', m.mu ?? 0)]));
  }
  heading('Sections and Materials');
  table(['Section No.', 'Section Type', `A (${ul('area')})`, `Iy (${ul('inertia')})`, `Iz (${ul('inertia')})`, `J (${ul('inertia')})`], model.sections.map(s => [s.id, s.name, sh('area', s.A), sh('inertia', s.Iy), sh('inertia', s.Iz), sh('inertia', s.J)]));
  table(['Material', 'Name', `E (${ul('stress')})`, `G (${ul('stress')})`, `Density (${ul('density')})`], model.materials.map(s => [s.id, s.name, sh('stress', s.E), sh('stress', s.G), sh('density', s.rho)]));
  heading('Load Cases and Combinations');
  table(['Case', 'Name', 'Definition'], [
    ...model.loadCases.map(c => [c.id, c.name, c.gx || c.gy || c.gz ? `Gravity factors (${c.gx}, ${c.gy}, ${c.gz})` : 'Applied loads']),
    ...model.combos.map(c => [c.id, c.name, Object.entries(c.f).filter(e => e[1]).map(([k, v]) => `${v} x ${model.combos.some(x => x.id === Number(k)) ? 'Combination' : 'Case'} ${k}`).join(' + ')]),
  ]);
  for (const c of an.cases) {
    heading(`Results: Case ${c.id}, ${c.name}`);
    if (c.error) { para(c.error); continue; }
    para('Reactions');
    table(['Node', ...['FX', 'FY', 'FZ'].map(l => `${l} (${ul('force')})`), ...['MX', 'MY', 'MZ'].map(l => `${l} (${ul('moment')})`)], [...c.reactions].map(([id, r]) => [id, ...r.map((v, i) => sh(i < 3 ? 'force' : 'moment', v))]));
    para('Node displacements');
    table(['Node', ...['DX', 'DY', 'DZ'].map(l => `${l} (${ul('length')})`), 'RX (rad)', 'RY (rad)', 'RZ (rad)'], [...c.disp].map(([id, d]) => [id, ...d.map((v, i) => (i < 3 ? sh('length', v) : g(v)))]));
    para('Member actions (minimum and maximum along each member)');
    const mm = (q: Quantity) => (a: number[]) => `${sh(q, Math.min(...a))} / ${sh(q, Math.max(...a))}`, mf = mm('force'), mmo = mm('moment');
    table(['Member', ...['N', 'Vy', 'Vz'].map(l => `${l} (${ul('force')})`), ...['T', 'My', 'Mz'].map(l => `${l} (${ul('moment')})`)], [...c.members].map(([id, r]) => [id, mf(r.N), mf(r.Vy), mf(r.Vz), mmo(r.T), mmo(r.My), mmo(r.Mz)]));
    if (c.buckling?.values.length) { para('Elastic critical buckling load factors'); table(['Mode', 'Load Factor'], c.buckling.values.map((v, i) => [i + 1, n(v, 3)])); }
  }
  if (an.modal?.values.length) { heading('Natural Frequencies'); table(['Mode', 'Frequency (Hz)', 'Period (s)'], an.modal.values.map((v, i) => [i + 1, n(v, 3), n(1 / v, 4)])); }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(100, 116, 139);
    doc.text(`CosmicWind  |  ${info.structure || model.title}`, M, 10); doc.text(`Page ${i} of ${pages}`, 210 - M, 10, { align: 'right' });
  }
  doc.save(`${(info.structure || model.title || 'CosmicWind').replace(/[^\w-]+/g, '_')}.pdf`);
}
