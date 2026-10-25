// Median and worst of one measurement across trials; null values (nothing measured) are left out.
export type Summary = { count: number; median: number | null; worst: number | null };
