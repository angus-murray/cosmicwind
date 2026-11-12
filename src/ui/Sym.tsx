import React from 'react';

/** Force, moment, displacement and rotation symbols with an axis subscript, such as Fx, MZ, Vy or DX. */
const TOKEN = /\b([DFIKMRV])([xyzXYZ])\b/g;

/** Text with its symbols typeset: the variable in italic and the axis subscript upright (lower case for a local axis, upper case for a global one). */
export function sym(text: string): React.ReactNode {
  const out: React.ReactNode[] = []; let last = 0, k = 0;
  for (const m of text.matchAll(TOKEN)) {
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    out.push(<React.Fragment key={k++}><i>{m[1]}</i><sub>{m[2]}</sub></React.Fragment>);
    last = i + m[0].length;
  }
  if (!out.length) return text;
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}
