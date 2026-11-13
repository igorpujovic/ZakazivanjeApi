using Microsoft.AspNetCore.Mvc;
using ZakazivanjeApi.Entities;

namespace ZakazivanjeApi.Services;

/// <summary>
/// Who may see the withdrawn half of the <b>catalogue</b>, as opposed to the <b>menu</b> that
/// the two list routes answer with by default (GLOSSARY.md). One place, so those two routes
/// cannot drift into refusing the same caller on different terms (ADR-0012).
/// </summary>
public static class CatalogueVisibility
{
    /// <summary>
    /// The refusal a caller has earned by asking for inactive rows without the role that comes
    /// with them, or <c>null</c> when they may have the list they asked for.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Refused rather than quietly narrowed back to the menu. The two routes are open to
    /// anyone, so a caller passing this flag without the role is either an admin screen holding
    /// a session that is no longer an admin's or a client that misread the contract — and
    /// answering a narrower question than the one asked hides both behind a <c>200</c>. It is
    /// the same position the booking list takes on <c>page=0</c>.
    /// </para>
    /// <para>
    /// A <c>401</c> for a caller the API cannot identify and a <c>403</c> for one it can, which
    /// is the division every admin route already makes. The <c>401</c> is the honest answer
    /// here: retrying with an administrator's token does work.
    /// </para>
    /// <para>
    /// This has to be the action's own decision rather than an <c>[Authorize]</c> attribute's,
    /// because authorization is settled before the action runs and these routes must stay open
    /// to everyone for the list they answer with by default.
    /// </para>
    /// </remarks>
    public static ActionResult? RefusalToWiden(
        this ControllerBase controller, bool includeInactive)
    {
        if (!includeInactive || controller.User.IsInRole(nameof(UserRole.Admin)))
        {
            return null;
        }

        // Challenge and Forbid rather than hand-built results, so these two statuses leave the
        // application exactly as the pipeline's own do — the bearer scheme's WWW-Authenticate
        // header on the 401, and the one ProblemDetails envelope on both (ADR-0008).
        return controller.User.Identity?.IsAuthenticated == true
            ? controller.Forbid()
            : controller.Challenge();
    }
}
