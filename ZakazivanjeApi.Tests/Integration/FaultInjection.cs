using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using ZakazivanjeApi.Dtos;
using ZakazivanjeApi.Services;

namespace ZakazivanjeApi.Tests.Integration;

/// <summary>
/// A catalogue that falls over, so the 500 path can be exercised through a real route. The
/// alternative — an endpoint that exists only to throw — would prove the pipeline handles a
/// route the API has not got, and nothing about the ones it has.
/// </summary>
public sealed class FailingStylistCatalogue : IStylistCatalogue
{
    /// <summary>
    /// Stands in for the sort of thing a real failure says: a connection string, a table name,
    /// a file path. Whatever the body ends up containing, it must not contain this.
    /// </summary>
    public const string SecretInTheMessage =
        @"Server=(localdb)\mssqllocaldb;Password=hunter2;Table=Stylists";

    public Task<IReadOnlyList<StylistResponse>> ListAsync(
        bool includeInactive, CancellationToken cancellationToken = default) =>
        Fall<IReadOnlyList<StylistResponse>>();

    public Task<StylistResponse> CreateAsync(
        CreateStylistRequest request, CancellationToken cancellationToken = default) =>
        Fall<StylistResponse>();

    public Task<StylistResponse> UpdateAsync(
        int id, UpdateStylistRequest request, CancellationToken cancellationToken = default) =>
        Fall<StylistResponse>();

    /// <summary>However it is asked, it falls over the same way.</summary>
    private static Task<T> Fall<T>() => throw new InvalidOperationException(SecretInTheMessage);
}

/// <summary>Everything the application logged, so a test can ask what reached the operator.</summary>
public sealed class CapturedLogs : ILoggerProvider
{
    private readonly StringBuilder _text = new();

    public string Text
    {
        get
        {
            lock (_text)
            {
                return _text.ToString();
            }
        }
    }

    public ILogger CreateLogger(string categoryName) => new Sink(_text);

    public void Dispose()
    {
    }

    private sealed class Sink(StringBuilder text) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            lock (text)
            {
                text.AppendLine(formatter(state, exception));
                text.AppendLine(exception?.ToString());
            }
        }
    }
}

/// <summary>Builds a host whose failure is arranged in advance.</summary>
public static class FaultInjectionHost
{
    /// <summary>
    /// The same application with its stylist catalogue swapped for one that throws, and its
    /// logs collected into <paramref name="logs"/>.
    /// </summary>
    public static WebApplicationFactory<Program> WithFailingStylists(
        this SalonApiFactory factory, CapturedLogs logs) =>
        factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureLogging(logging => logging.AddProvider(logs));
            builder.ConfigureTestServices(services =>
                services.AddScoped<IStylistCatalogue, FailingStylistCatalogue>());
        });
}
