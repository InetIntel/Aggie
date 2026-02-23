export interface AsnInfo {
    asn: string;        // "as58303"
    number: number;     // 58303
    name?: string;      // "IR-RasanaPishtaz ..."
    country?: string;   // "ir"
    source?: string;    // "IHR" | "ripe" 
    populationCoverageTotal?: number | null;
    populationCoverageDirect?: number | null;
    populationCoverageIndirect?: number | null;
    asCoverageTotal?: number | null;
  }
  
  export type AsnInfoMap = Record<string, AsnInfo>; 
  // e.g. { "as58303": { ... }}
