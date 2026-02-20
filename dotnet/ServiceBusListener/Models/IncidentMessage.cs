using System.Text.Json.Serialization;

namespace ServiceBusListener.Models;

/// <summary>
/// Flat DTO representing an incident event, serialized as NDJSON to stdout.
/// </summary>
public sealed class IncidentMessage
{
    [JsonPropertyName("incidentId")]
    public string IncidentId { get; set; } = string.Empty;

    [JsonPropertyName("title")]
    public string? Title { get; set; }

    [JsonPropertyName("ticketNumber")]
    public string? TicketNumber { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("priorityCode")]
    public int? PriorityCode { get; set; }

    [JsonPropertyName("priorityLabel")]
    public string? PriorityLabel { get; set; }

    [JsonPropertyName("statusCode")]
    public int? StatusCode { get; set; }

    [JsonPropertyName("statusLabel")]
    public string? StatusLabel { get; set; }

    [JsonPropertyName("caseOriginCode")]
    public int? CaseOriginCode { get; set; }

    [JsonPropertyName("caseOriginLabel")]
    public string? CaseOriginLabel { get; set; }

    [JsonPropertyName("stateCode")]
    public int? StateCode { get; set; }

    [JsonPropertyName("stateLabel")]
    public string? StateLabel { get; set; }

    [JsonPropertyName("caseTypeCode")]
    public int? CaseTypeCode { get; set; }

    [JsonPropertyName("createdOn")]
    public DateTime? CreatedOn { get; set; }

    [JsonPropertyName("modifiedOn")]
    public DateTime? ModifiedOn { get; set; }

    [JsonPropertyName("messageName")]
    public string MessageName { get; set; } = string.Empty;

    [JsonPropertyName("timestamp")]
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}
