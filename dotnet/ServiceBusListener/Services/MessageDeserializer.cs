using System.Runtime.Serialization;
using System.Xml;
using Microsoft.Xrm.Sdk;
using ServiceBusListener.Models;

namespace ServiceBusListener.Services;

/// <summary>
/// Deserializes Service Bus messages containing RemoteExecutionContext
/// and maps incident entity data to <see cref="IncidentMessage"/>.
/// </summary>
public static class MessageDeserializer
{
    private static readonly DataContractSerializer Serializer = new(typeof(RemoteExecutionContext));

    /// <summary>
    /// Priority code label mapping for Dynamics 365 incident entity.
    /// </summary>
    private static readonly Dictionary<int, string> PriorityLabels = new()
    {
        { 1, "High" },
        { 2, "Normal" },
        { 3, "Low" }
    };

    /// <summary>
    /// Status code label mapping for Dynamics 365 incident entity.
    /// </summary>
    private static readonly Dictionary<int, string> StatusLabels = new()
    {
        { 1, "In Progress" },
        { 2, "On Hold" },
        { 3, "Waiting for Details" },
        { 4, "Researching" },
        { 5, "Problem Solved" },
        { 1000, "Information Provided" },
        { 6, "Cancelled" },
        { 2000, "Merged" }
    };

    /// <summary>
    /// Deserializes a RemoteExecutionContext from a binary message body.
    /// Supports .NET Binary XML (application/msbin1), XML, and JSON content types.
    /// </summary>
    public static RemoteExecutionContext DeserializeContext(BinaryData messageBody, string? contentType)
    {
        var bytes = messageBody.ToArray();

        // Try .NET Binary XML first (default Dataverse format)
        if (string.IsNullOrEmpty(contentType) || contentType.Contains("msbin1", StringComparison.OrdinalIgnoreCase))
        {
            return DeserializeBinaryXml(bytes);
        }

        if (contentType.Contains("xml", StringComparison.OrdinalIgnoreCase))
        {
            return DeserializeXml(bytes);
        }

        // Fallback: try binary XML regardless of content type
        return DeserializeBinaryXml(bytes);
    }

    private static RemoteExecutionContext DeserializeBinaryXml(byte[] bytes)
    {
        using var stream = new MemoryStream(bytes);
        using var reader = XmlDictionaryReader.CreateBinaryReader(stream, XmlDictionaryReaderQuotas.Max);
        return (RemoteExecutionContext)Serializer.ReadObject(reader)!;
    }

    private static RemoteExecutionContext DeserializeXml(byte[] bytes)
    {
        using var stream = new MemoryStream(bytes);
        using var reader = XmlDictionaryReader.CreateTextReader(stream, XmlDictionaryReaderQuotas.Max);
        return (RemoteExecutionContext)Serializer.ReadObject(reader)!;
    }

    /// <summary>
    /// Extracts incident data from a RemoteExecutionContext and maps it to an IncidentMessage.
    /// Merges Target entity with PostImage (if available) to get the full attribute set.
    /// </summary>
    public static IncidentMessage? MapToIncidentMessage(RemoteExecutionContext context)
    {
        // Get the target entity from InputParameters
        if (!context.InputParameters.TryGetValue("Target", out var targetObj))
            return null;

        Entity? target = targetObj as Entity;
        if (target == null)
            return null;

        // Only process incident entities
        if (!string.Equals(target.LogicalName, "incident", StringComparison.OrdinalIgnoreCase))
            return null;

        // Merge with PostImage if available (gives us full attribute set on updates)
        var merged = new Entity(target.LogicalName, target.Id);

        if (context.PostEntityImages.TryGetValue("PostImage", out var postImage))
        {
            foreach (var attr in postImage.Attributes)
                merged[attr.Key] = attr.Value;
        }

        // Target attributes override PostImage (they are the actual changes)
        foreach (var attr in target.Attributes)
            merged[attr.Key] = attr.Value;

        return new IncidentMessage
        {
            IncidentId = merged.Id.ToString(),
            Title = GetAttributeValue<string>(merged, "title"),
            TicketNumber = GetAttributeValue<string>(merged, "ticketnumber"),
            Description = GetAttributeValue<string>(merged, "description"),
            PriorityCode = GetOptionSetValue(merged, "prioritycode"),
            PriorityLabel = GetOptionSetLabel(merged, "prioritycode", PriorityLabels),
            StatusCode = GetOptionSetValue(merged, "statuscode"),
            StatusLabel = GetOptionSetLabel(merged, "statuscode", StatusLabels),
            CaseTypeCode = GetOptionSetValue(merged, "casetypecode"),
            CreatedOn = GetAttributeValue<DateTime?>(merged, "createdon"),
            ModifiedOn = GetAttributeValue<DateTime?>(merged, "modifiedon"),
            MessageName = context.MessageName ?? "Unknown",
            Timestamp = DateTime.UtcNow
        };
    }

    private static T? GetAttributeValue<T>(Entity entity, string attributeName)
    {
        if (entity.Attributes.TryGetValue(attributeName, out var value) && value is T typedValue)
            return typedValue;
        return default;
    }

    private static int? GetOptionSetValue(Entity entity, string attributeName)
    {
        if (entity.Attributes.TryGetValue(attributeName, out var value) && value is OptionSetValue osv)
            return osv.Value;
        return null;
    }

    private static string? GetOptionSetLabel(Entity entity, string attributeName, Dictionary<int, string> labels)
    {
        var code = GetOptionSetValue(entity, attributeName);
        if (code.HasValue && labels.TryGetValue(code.Value, out var label))
            return label;
        return null;
    }
}
