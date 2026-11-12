using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using ZakazivanjeApi.Domain;

namespace ZakazivanjeApi.Tests.Domain;

/// <summary>
/// The options as configuration actually hands them over. Worth its own tests because the
/// binder, not the validator, decides what <c>"Sunday": null</c> becomes.
/// </summary>
public class WorkingHoursBindingTests
{
    private static WorkingHoursOptions Bind(string json)
    {
        var path = Path.Combine(Path.GetTempPath(), $"workinghours-{Guid.NewGuid():N}.json");
        File.WriteAllText(path, json);

        try
        {
            var configuration = new ConfigurationBuilder().AddJsonFile(path).Build();
            var options = new WorkingHoursOptions();
            configuration.GetSection(WorkingHoursOptions.SectionName).Bind(options);
            return options;
        }
        finally
        {
            File.Delete(path);
        }
    }

    private const string SalonConfiguration = """
        {
          "WorkingHours": {
            "SlotGridMinutes": 15,
            "Days": {
              "Monday": { "Open": "09:00", "Close": "17:00" },
              "Saturday": { "Open": "09:00", "Close": "14:00" },
              "Sunday": null
            }
          }
        }
        """;

    [Fact]
    public void Reads_the_open_and_close_of_a_configured_day()
    {
        var hours = Bind(SalonConfiguration).ForDay(DayOfWeek.Saturday);

        Assert.NotNull(hours);
        Assert.Equal(new TimeOnly(9, 0), hours.Value.Open);
        Assert.Equal(new TimeOnly(14, 0), hours.Value.Close);
    }

    [Fact]
    public void Reads_the_slot_grid()
    {
        Assert.Equal(15, Bind(SalonConfiguration).SlotGridMinutes);
    }

    [Fact]
    public void Treats_a_null_entry_as_a_closed_day()
    {
        Assert.Null(Bind(SalonConfiguration).ForDay(DayOfWeek.Sunday));
    }

    [Fact]
    public void Treats_an_absent_entry_as_a_closed_day()
    {
        Assert.Null(Bind(SalonConfiguration).ForDay(DayOfWeek.Tuesday));
    }

    [Fact]
    public void Accepts_the_configuration_the_application_ships_with()
    {
        var options = Bind(File.ReadAllText(
            Path.Combine(AppContext.BaseDirectory, "appsettings.json")));

        var result = new WorkingHoursOptionsValidator().Validate(Options.DefaultName, options);

        Assert.True(result.Succeeded, result.FailureMessage);
    }
}
