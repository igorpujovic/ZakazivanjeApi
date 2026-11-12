using Microsoft.Extensions.Options;

namespace ZakazivanjeApi.Domain;

/// <summary>
/// Checks the working hours at startup, so a malformed range fails the boot rather than the
/// first booking attempt (ADR-0002). Reports every problem it finds, not just the first.
/// </summary>
public class WorkingHoursOptionsValidator : IValidateOptions<WorkingHoursOptions>
{
    private const int MinutesInADay = 24 * 60;

    public ValidateOptionsResult Validate(string? name, WorkingHoursOptions options)
    {
        var failures = new List<string>();
        var anyDayIsOpen = false;

        if (options.SlotGridMinutes is <= 0 or > MinutesInADay)
        {
            failures.Add(
                $"WorkingHours:SlotGridMinutes must be between 1 and {MinutesInADay}, "
                    + $"but was {options.SlotGridMinutes}.");
        }

        foreach (var (day, hours) in options.Days)
        {
            if (!Enum.TryParse<DayOfWeek>(day, ignoreCase: true, out _))
            {
                failures.Add($"WorkingHours:Days:{day} is not the name of a weekday.");
                continue;
            }

            // Half an entry is a typo. A whole missing one is a closed day, which is fine.
            if (hours is { Open: null, Close: not null } or { Open: not null, Close: null })
            {
                failures.Add(
                    $"WorkingHours:Days:{day} sets only one of Open and Close. Set both, or "
                        + "remove the day to close it.");
                continue;
            }

            if (WorkingHoursOptions.ToWorkingHours(hours) is not { } workingHours)
            {
                continue;
            }

            anyDayIsOpen = true;

            if (workingHours.Close <= workingHours.Open)
            {
                failures.Add(
                    $"WorkingHours:Days:{day} closes at {workingHours.Close.ToString("HH:mm")}, "
                        + $"which is not after its open at {workingHours.Open.ToString("HH:mm")}.");
            }
        }

        if (!anyDayIsOpen)
        {
            failures.Add(
                "WorkingHours:Days has no open day, so nothing could ever be booked. "
                    + "Configure at least one weekday.");
        }

        return failures.Count == 0
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail(failures);
    }
}
