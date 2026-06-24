import React, { useState } from 'react';
import { fmtCLP } from '../../utils/format';

// Gráfico de barras de volumen diario en SVG puro (sin dependencias).
export default function VolumenChart({ serie }) {
  const [hover, setHover] = useState(null);

  if (!serie || serie.length === 0) {
    return <p className="text-sm text-gray-400">Sin datos para mostrar.</p>;
  }

  const max = Math.max(...serie.map(s => s.vol), 1);
  const W = 720, H = 220, padL = 8, padB = 28, padT = 10;
  const innerW = W - padL * 2;
  const innerH = H - padB - padT;
  const bw = innerW / serie.length;

  const fmtDia = (d) => {
    const [, m, day] = d.split('-');
    return `${day}/${m}`;
  };

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[560px]" style={{ height: 'auto' }}>
        {[0.25, 0.5, 0.75, 1].map(f => (
          <line key={f} x1={padL} x2={W - padL} y1={padT + innerH * (1 - f)} y2={padT + innerH * (1 - f)}
            stroke="#f1f5f9" strokeWidth="1" />
        ))}
        {serie.map((s, i) => {
          const h = (s.vol / max) * innerH;
          const x = padL + i * bw;
          const y = padT + innerH - h;
          const activo = hover === i;
          return (
            <g key={s.dia}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={x + 4} y={y} width={Math.max(bw - 8, 2)} height={h}
                rx="3" fill={activo ? '#0d9488' : '#5eead4'} className="transition-colors" />
              <rect x={x} y={padT} width={bw} height={innerH} fill="transparent" />
              <text x={x + bw / 2} y={H - 10} textAnchor="middle" fontSize="10" fill="#94a3b8">
                {fmtDia(s.dia)}
              </text>
            </g>
          );
        })}
        {hover !== null && (
          <g>
            <text x={padL} y={padT + 2} fontSize="12" fontWeight="600" fill="#0f172a">
              {fmtDia(serie[hover].dia)}: {fmtCLP(serie[hover].vol)} CLP · {serie[hover].n} ops
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
