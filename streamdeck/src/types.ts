/** Mirrors the .NET IncidentMessage DTO (camelCase via JsonPropertyName). */
export interface IncidentMessage {
  incidentId: string;
  title: string | null;
  ticketNumber: string | null;
  description: string | null;
  priorityCode: number | null;
  priorityLabel: string | null;
  statusCode: number | null;
  statusLabel: string | null;
  caseOriginCode: number | null;
  caseOriginLabel: string | null;
  caseTypeCode: number | null;
  createdOn: string | null;
  modifiedOn: string | null;
  messageName: string;
  timestamp: string;
}

/** Priority code → background color. */
export const PRIORITY_COLORS: Record<number, string> = {
  1: "#d32f2f", // High — red
  2: "#1976d2", // Normal — blue
  3: "#388e3c", // Low — green
};

export const DEFAULT_PRIORITY_COLOR = "#616161";

/** Case origin code → emoji. */
export const ORIGIN_EMOJIS: Record<number, string> = {
  1: "\u{260E}\u{FE0F}",  // Phone: telephone
  2: "\u{2709}\u{FE0F}",  // Email: envelope
  3: "\u{1F310}",          // Web: globe
};

/** Stream Deck XL layout constants. */
export const INCIDENT_KEY_START = 0;
export const INCIDENT_KEY_COUNT = 32;
export const KEY_SIZE = 96;
export const GRID_COLUMNS = 8;
export const GRID_ROWS = 4;
