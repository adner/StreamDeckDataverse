using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ServiceBusListener.Services;

var builder = Host.CreateApplicationBuilder(args);

// Route all logging to stderr so stdout stays clean for NDJSON
builder.Logging.ClearProviders();
builder.Logging.AddConsole(options =>
{
    options.LogToStandardErrorThreshold = LogLevel.Trace;
});

// Support --tee <filepath> CLI argument
var teeIndex = Array.IndexOf(args, "--tee");
if (teeIndex >= 0 && teeIndex + 1 < args.Length)
{
    builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
    {
        ["Tee:FilePath"] = args[teeIndex + 1]
    });
}

builder.Services.AddHostedService<ServiceBusListenerService>();

var host = builder.Build();
await host.RunAsync();
