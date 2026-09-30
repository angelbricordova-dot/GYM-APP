// Gráficas mínimas sin librerías: anillo SVG, línea SVG y barras con divs.

export function ring({ value, max, size = 120, stroke = 12, color = 'var(--accent)', label = '', sub = '' }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, max ? value / max : 0));
  const mid = size / 2;
  return `<div class="ring" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke="var(--track)" stroke-width="${stroke}"/>
      <circle cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - pct)).toFixed(2)}" transform="rotate(-90 ${mid} ${mid})"/>
    </svg>
    <div class="ring-in"><b>${label}</b><small>${sub}</small></div>
  </div>`;
}

/** points: [{ label, y }] */
export function lineChart(points, { unit = '', height = 150, color = 'var(--accent)' } = {}) {
  if (points.length < 2) return '<p class="muted small">Con 2 registros o más aparece tu gráfica.</p>';
  const W = 320, H = height, L = 34, R = 10, T = 12, B = 22;
  const ys = points.map((p) => p.y);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (lo === hi) { lo -= 1; hi += 1; }
  const padY = (hi - lo) * 0.15;
  lo -= padY; hi += padY;
  const x = (i) => L + (i / (points.length - 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.y).toFixed(1)}`).join(' ');
  const area = `${path} L${x(points.length - 1).toFixed(1)} ${H - B} L${x(0).toFixed(1)} ${H - B} Z`;
  const fmt = (v) => (Math.round(v * 10) / 10).toString();
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfica de progreso">
    <path d="${area}" fill="${color}" opacity=".12"/>
    <path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.y).toFixed(1)}" r="3.5" fill="${color}"/>`).join('')}
    <text x="${L - 6}" y="${T + 4}" text-anchor="end">${fmt(hi - padY)}${unit}</text>
    <text x="${L - 6}" y="${H - B}" text-anchor="end">${fmt(lo + padY)}${unit}</text>
    <text x="${L}" y="${H - 5}" text-anchor="start">${points[0].label}</text>
    <text x="${W - R}" y="${H - 5}" text-anchor="end">${points.at(-1).label}</text>
  </svg>`;
}

/** items: [{ label, value, hot? }] */
export function barChart(items, { max, goal, unit = '' } = {}) {
  const top = max || Math.max(1, ...items.map((i) => i.value));
  return `<div class="bars">${items
    .map(
      (i) => `<div class="bar-col"><div class="bar-track">
        ${goal ? `<i class="goal" style="bottom:${Math.min(100, (goal / top) * 100)}%"></i>` : ''}
        <div class="bar${i.hot ? ' hot' : ''}" style="height:${Math.min(100, (i.value / top) * 100)}%"></div>
      </div><small>${i.label}</small>${unit ? `<em>${i.value ? i.value + unit : ''}</em>` : ''}</div>`
    )
    .join('')}</div>`;
}
