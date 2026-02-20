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

/** Stream Deck XL layout constants. */
export const INCIDENT_KEY_START = 8;
export const INCIDENT_KEY_COUNT = 24;
export const KEY_SIZE = 96;
