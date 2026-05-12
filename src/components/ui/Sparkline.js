'use client';
import styles from './Sparkline.module.css';

// SVG sparkline minimal — recebe um array de números e desenha uma linha.
export default function Sparkline({ data = [], width = 80, height = 24, stroke, fill }) {
  if (!data || data.length < 2) {
    return <span className={styles.placeholder} style={{ width, height }} aria-hidden />;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const pts = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return [x, y];
  });
  const linePath = pts.reduce((acc, [x, y], i) => acc + (i === 0 ? `M${x},${y}` : ` L${x},${y}`), '');
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
  return (
    <svg
      className={styles.svg}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={areaPath} fill={fill || 'currentColor'} fillOpacity="0.12" />
      <path d={linePath} stroke={stroke || 'currentColor'} strokeWidth="1.5" fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
