type Props = { done: number; total: number; size?: number; label: string };

/** Anillo de progreso con «3/5» al centro. `label` es el texto para lectores de pantalla. */
export function ProgressRing({ done, total, size = 56, label }: Props) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const ratio = total > 0 ? Math.min(done / total, 1) : 0;
  return (
    <span role="img" aria-label={label} style={{ position: "relative", display: "inline-flex", width: size, height: size, flex: "none" }}>
      <svg width={size} height={size} viewBox="0 0 56 56" fill="none" aria-hidden="true" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="28" cy="28" r={r} stroke="var(--c-line)" strokeWidth="4" />
        <circle cx="28" cy="28" r={r} stroke="var(--c-accent)" strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - ratio)} />
      </svg>
      <span aria-hidden="true" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", font: "var(--fw-bold) var(--fs-small)/1 var(--font)" }}>
        {done}/{total}
      </span>
    </span>
  );
}
