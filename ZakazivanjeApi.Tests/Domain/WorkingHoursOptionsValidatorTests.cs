using Microsoft.Extensions.Options;
using ZakazivanjeApi.Domain;

namespace ZakazivanjeApi.Tests.Domain;

public class WorkingHoursOptionsValidatorTests
{
    private static ValidateOptionsResult Validate(WorkingHoursOptions options) =>
        new WorkingHoursOptionsValidator().Validate(Options.DefaultName, options);

    /// <summary>A day the salon is open, written as configuration would supply it.</summary>
    private static DayHours Open(int openHour, int closeHour) =>
        new() { Open = new TimeOnly(openHour, 0), Close = new TimeOnly(closeHour, 0) };

    /// <summary>An otherwise valid configuration, so each test varies one thing only.</summary>
    private static WorkingHoursOptions Configured(
        int slotGridMinutes = 15,
        params (string Day, DayHours? Hours)[] days)
    {
        var options = new WorkingHoursOptions { SlotGridMinutes = slotGridMinutes };
        options.Days["Monday"] = Open(9, 17);

        foreach (var (day, hours) in days)
        {
            options.Days[day] = hours;
        }

        return options;
    }

    [Fact]
    public void Accepts_a_well_formed_configuration()
    {
        var options = Configured(days: ("Saturday", Open(9, 14)));

        Assert.True(Validate(options).Succeeded);
    }

    [Theory]
    [InlineData(17, 9)]  // close before open
    [InlineData(9, 9)]   // zero-length day
    public void Rejects_a_day_whose_close_does_not_follow_its_open(int openHour, int closeHour)
    {
        var options = Configured(days: ("Tuesday", Open(openHour, closeHour)));

        var result = Validate(options);

        Assert.True(result.Failed);
        Assert.Contains("Tuesday", result.FailureMessage);
    }

    [Fact]
    public void Rejects_a_weekday_name_it_does_not_recognise()
    {
        var options = Configured(days: ("Thurdsay", Open(9, 17)));

        var result = Validate(options);

        Assert.True(result.Failed);
        Assert.Contains("Thurdsay", result.FailureMessage);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-15)]
    [InlineData(1441)]
    public void Rejects_a_slot_grid_that_is_not_a_usable_step(int slotGridMinutes)
    {
        var result = Validate(Configured(slotGridMinutes));

        Assert.True(result.Failed);
        Assert.Contains("SlotGridMinutes", result.FailureMessage);
    }

    [Fact]
    public void Accepts_a_null_entry_as_a_closed_day()
    {
        var options = Configured(days: ("Sunday", null));

        Assert.True(Validate(options).Succeeded);
    }

    [Fact]
    public void Accepts_an_empty_entry_as_a_closed_day()
    {
        // What the configuration binder makes of "Sunday": null.
        var options = Configured(days: ("Sunday", new DayHours()));

        var result = Validate(options);

        Assert.True(result.Succeeded, result.FailureMessage);
    }

    [Fact]
    public void Rejects_a_day_that_sets_only_one_of_open_and_close()
    {
        var options = Configured(
            days: ("Friday", new DayHours { Open = new TimeOnly(9, 0) }));

        var result = Validate(options);

        Assert.True(result.Failed);
        Assert.Contains("Friday", result.FailureMessage);
    }

    [Fact]
    public void Rejects_a_configuration_in_which_every_day_is_closed()
    {
        // The shape an absent WorkingHours section binds to. Failing here means a missing
        // section stops the boot instead of quietly making the salon unbookable.
        var result = Validate(new WorkingHoursOptions());

        Assert.True(result.Failed);
        Assert.Contains("no open day", result.FailureMessage);
    }

    [Fact]
    public void Reports_every_malformed_day_not_just_the_first()
    {
        var options = Configured(
            days: [("Tuesday", Open(18, 10)), ("Wednesday", Open(19, 11))]);

        var result = Validate(options);

        Assert.True(result.Failed);
        Assert.Contains("Tuesday", result.FailureMessage);
        Assert.Contains("Wednesday", result.FailureMessage);
    }

    [Fact]
    public void Finds_a_days_working_hours_whatever_the_casing_of_its_key()
    {
        var options = new WorkingHoursOptions { Days = { ["monday"] = Open(9, 17) } };

        Assert.NotNull(options.ForDay(DayOfWeek.Monday));
        Assert.Null(options.ForDay(DayOfWeek.Sunday));
    }
}
