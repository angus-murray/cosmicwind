import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Model } from './model/types';
import type { Analysis } from './solver/frame';

export interface ReportInfo { project: string; number: string; structure: string; designer: string; date: string }
const n = (v: number, d = 2) => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d);

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

export async function makeReport(model: Model, an: Analysis, info: ReportInfo, svg: SVGSVGElement | null) {
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
  para(`${model.nodes.length} nodes, ${model.members.length} members, ${model.loadCases.length} load cases, ${model.combos.length} combinations. Analysis: ${model.settings.nonlinear ? 'second-order (P-Delta)' : 'linear elastic'}. Units: m, kN, kNm; Y is vertical.`);
  const pic = svg && await svgImage(svg);
  if (pic) { const h = Math.min(W * pic.h / pic.w, 110), w = h * pic.w / pic.h; doc.addImage(pic.data, 'JPEG', M + (W - w) / 2, y, w, h); y += h + 5; }
  heading('Nodes');
  table(['Node', 'X (m)', 'Y (m)', 'Z (m)', 'Restraint'], model.nodes.map(v => [v.id, n(v.x, 3), n(v.y, 3), n(v.z, 3), v.r]));
  heading('Members');
  const sn = new Map(model.sections.map(s => [s.id, s.name])), mn = new Map(model.materials.map(s => [s.id, s.name]));
  table(['Member', 'Node A', 'Node B', 'Section', 'Material', 'Angle (deg)', 'Type', 'Release A', 'Release B'], model.members.map(m => [m.id, m.a, m.b, sn.get(m.sec) ?? m.sec, mn.get(m.mat) ?? m.mat, m.angle, { N: 'Normal', T: 'Tension only', C: 'Compression only' }[m.type], m.relA, m.relB]));
  heading('Sections and Materials');
  table(['Section', 'Name', 'A (mm2)', 'Iy (mm4)', 'Iz (mm4)', 'J (mm4)'], model.sections.map(s => [s.id, s.name, n(s.A, 0), s.Iy.toExponential(3), s.Iz.toExponential(3), s.J.toExponential(3)]));
  table(['Material', 'Name', 'E (MPa)', 'G (MPa)', 'Density (kg/m3)'], model.materials.map(s => [s.id, s.name, s.E, s.G, s.rho]));
  heading('Load Cases and Combinations');
  table(['Case', 'Name', 'Definition'], [
    ...model.loadCases.map(c => [c.id, c.name, c.gx || c.gy || c.gz ? `Self-weight factors (${c.gx}, ${c.gy}, ${c.gz})` : 'Applied loads']),
    ...model.combos.map(c => [c.id, c.name, Object.entries(c.f).filter(e => e[1]).map(([k, v]) => `${v} x Case ${k}`).join(' + ')]),
  ]);
  for (const c of an.cases) {
    heading(`Results: Case ${c.id}, ${c.name}`);
    if (c.error) { para(c.error); continue; }
    para('Reactions');
    table(['Node', 'FX (kN)', 'FY (kN)', 'FZ (kN)', 'MX (kNm)', 'MY (kNm)', 'MZ (kNm)'], [...c.reactions].map(([id, r]) => [id, ...r.map(v => n(v))]));
    para('Node displacements');
    table(['Node', 'DX (mm)', 'DY (mm)', 'DZ (mm)', 'RX (mrad)', 'RY (mrad)', 'RZ (mrad)'], [...c.disp].map(([id, d]) => [id, ...d.map(v => n(v * 1000, 3))]));
    para('Member actions (minimum and maximum along each member)');
    const mm = (a: number[]) => `${n(Math.min(...a))} / ${n(Math.max(...a))}`;
    table(['Member', 'N (kN)', 'Vy (kN)', 'Vz (kN)', 'T (kNm)', 'My (kNm)', 'Mz (kNm)'], [...c.members].map(([id, r]) => [id, mm(r.N), mm(r.Vy), mm(r.Vz), mm(r.T), mm(r.My), mm(r.Mz)]));
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
