import type { SVGProps } from "react";

/** Íconos de línea de 24 px (trazo 2, extremos redondeados), tomados del prototipo. */
const paths = {
  home: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  user: "M4 21c0-4 4-6 8-6s8 2 8 6M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  close: "M6 6l12 12M18 6L6 18",
  chevronRight: "M9 5l7 7-7 7",
  chevronLeft: "M15 5l-7 7 7 7",
  star: "M12 3l2.8 6 6.7.8-5 4.5 1.4 6.7L12 17.6 6.1 21l1.4-6.7-5-4.5 6.7-.8z",
  pause: "M8 5v14M16 5v14",
  play: "M7 4l13 8-13 8z",
  check: "M5 12l5 5 9-10",
} as const;

export type IconName = keyof typeof paths;

type Props = Omit<SVGProps<SVGSVGElement>, "name"> & { name: IconName; size?: number; filled?: boolean };

export function Icon({ name, size = 24, filled = false, ...rest }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={paths[name]} />
    </svg>
  );
}
