using System.Text.Json;
using Azure.Messaging.ServiceBus;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ServiceBusListener.Services;

/// <summary>
/// BackgroundService that subscribes to an Azure Service Bus queue,
/// deserializes RemoteExecutionContext messages, and writes incident
/// data as NDJSON to stdout.
/// </summary>
public sealed class ServiceBusListenerService : BackgroundService
{
    private readonly ILogger<ServiceBusListenerService> _logger;
    private readonly string _connectionString;
    private readonly string _queueName;
    private readonly string? _teeFilePath;
    private readonly JsonSerializerOptions _jsonOptions;

    private ServiceBusClient? _client;
    private ServiceBusProcessor? _processor;

    public ServiceBusListenerService(ILogger<ServiceBusListenerService> logger, IConfiguration configuration)
    {
        _logger = logger;
        _connectionString = configuration["ServiceBus:ConnectionString"]
            ?? throw new InvalidOperationException("ServiceBus:ConnectionString is not configured. Copy appsettings.template.json to appsettings.json and fill in your connection string.");
        _queueName = configuration["ServiceBus:QueueName"] ?? "dataverseupdates";
        _teeFilePath = configuration["Tee:FilePath"];

        _jsonOptions = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            WriteIndented = false
        };
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Starting Service Bus listener on queue '{QueueName}'", _queueName);

        _client = new ServiceBusClient(_connectionString);
        _processor = _client.CreateProcessor(_queueName, new ServiceBusProcessorOptions
        {
            AutoCompleteMessages = false,
            MaxConcurrentCalls = 1
        });

        _processor.ProcessMessageAsync += ProcessMessageAsync;
        _processor.ProcessErrorAsync += ProcessErrorAsync;

        await _processor.StartProcessingAsync(stoppingToken);

        _logger.LogInformation("Service Bus listener started. Waiting for messages...");

        // Keep the service alive until cancellation is requested
        try
        {
            await Task.Delay(Timeout.Infinite, stoppingToken);
        }
        catch (OperationCanceledException)
        {
            // Expected on shutdown
        }
    }

    private async Task ProcessMessageAsync(ProcessMessageEventArgs args)
    {
        try
        {
            _logger.LogDebug("Received message: {MessageId}", args.Message.MessageId);

            var context = MessageDeserializer.DeserializeContext(args.Message.Body, args.Message.ContentType);
            var incident = MessageDeserializer.MapToIncidentMessage(context);

            if (incident != null)
            {
                var json = JsonSerializer.Serialize(incident, _jsonOptions);

                // Write NDJSON to stdout
                await Console.Out.WriteLineAsync(json);
                await Console.Out.FlushAsync();

                // Tee to file if configured
                if (!string.IsNullOrEmpty(_teeFilePath))
                {
                    await File.AppendAllTextAsync(_teeFilePath, json + Environment.NewLine);
                }

                _logger.LogInformation(
                    "Processed incident: {TicketNumber} \"{Title}\" ({Priority})",
                    incident.TicketNumber ?? "N/A",
                    incident.Title ?? "No title",
                    incident.PriorityLabel ?? "Unknown");
            }
            else
            {
                _logger.LogWarning(
                    "Message {MessageId} did not contain an incident entity (entity: {EntityName}, message: {MessageName})",
                    args.Message.MessageId,
                    context.PrimaryEntityName ?? "unknown",
                    context.MessageName ?? "unknown");
            }

            await args.CompleteMessageAsync(args.Message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing message {MessageId}", args.Message.MessageId);

            // Abandon the message so it can be retried
            await args.AbandonMessageAsync(args.Message);
        }
    }

    private Task ProcessErrorAsync(ProcessErrorEventArgs args)
    {
        _logger.LogError(args.Exception,
            "Service Bus error. Source: {ErrorSource}, Namespace: {Namespace}, Entity: {Entity}",
            args.ErrorSource,
            args.FullyQualifiedNamespace,
            args.EntityPath);

        return Task.CompletedTask;
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Stopping Service Bus listener...");

        if (_processor != null)
        {
            await _processor.StopProcessingAsync(cancellationToken);
            await _processor.DisposeAsync();
        }

        if (_client != null)
        {
            await _client.DisposeAsync();
        }

        await base.StopAsync(cancellationToken);
        _logger.LogInformation("Service Bus listener stopped.");
    }
}
