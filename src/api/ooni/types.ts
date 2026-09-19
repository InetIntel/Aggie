export interface OoniSeries {
  asn: number;
  since: string;
  until: string;
  days: string[];
  /** Measurement count per day, keyed by watched domain. */
  domains: Record<string, number[]>;
}
