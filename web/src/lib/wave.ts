/** Puntos de una onda que se repite cada `period` px (el desplazamiento de -period px cierra el ciclo sin salto). */
export function wavePoints(width: number, mid: number, amplitude: number, period = 390, phase = 0): string {
  const pts: string[] = [];
  for (let x = 0; x <= width; x += 5) {
    const a = (2 * Math.PI * x) / period + phase;
    const y = mid + amplitude * (0.82 * Math.sin(a) + 0.18 * Math.sin(2 * a + 0.6));
    pts.push(`${x},${y.toFixed(1)}`);
  }
  return pts.join(" ");
}
