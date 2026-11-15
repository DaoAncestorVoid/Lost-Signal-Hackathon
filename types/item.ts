export type ReportType = "lost" | "found";
export type ResolutionStatus = "open" | "resolved";

/** Shared application/API contract. Storage adapters should map to these fields. */
export interface Item {
  id: string;
  reportType: ReportType;
  status: ResolutionStatus;
  description: string;
  /** Short report title, when available. */
  title?: string;
  /** When the item was lost/found, not when the report was posted. */
  itemDate?: string | null;
  category?: string;
  color?: string;
  brand?: string;
  features?: string[];
  /** Free-text campus location, e.g. "North Library entrance". */
  location?: string;
}

export interface ItemMatch {
  item: Item;
  /** Similarity from 0 to 100, not a probability of ownership. */
  score: number;
  reasons: string[];
}
