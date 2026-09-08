/** English ordinal suffix: 1st, 2nd, 3rd, 42nd, 13th. */
export function ordinal(n: number): string {
  const rounded = Math.round(n);
  const mod100 = Math.abs(rounded) % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${rounded}th`;
  switch (Math.abs(rounded) % 10) {
    case 1:
      return `${rounded}st`;
    case 2:
      return `${rounded}nd`;
    case 3:
      return `${rounded}rd`;
    default:
      return `${rounded}th`;
  }
}

/** Percentile phrased for copy, e.g. 0.42 -> "42nd". */
export function percentileLabel(fraction: number): string {
  return ordinal(fraction * 100);
}
