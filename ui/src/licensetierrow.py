from gi.repository import Gtk

tier_names = {
    'supporter': 'Gaming Supporter Tier',
    'subscriber': 'Productivity Tier',
    'subscriber_pro': 'Productivity Pro Tier',
}

period_names = {
    'monthly': 'Monthly renewal',
    'yearly': 'Yearly renewal',
    'lifetime': 'Lifetime access',
}

@Gtk.Template(resource_path='/com/xronlinux/BreezyDesktop/gtk/license-tier-row.ui')
class LicenseTierRow(Gtk.Grid):
    __gtype_name__ = 'LicenseTierRow'

    tier_name = Gtk.Template.Child()
    tier_status = Gtk.Template.Child()
    tier_funds_needed_usd = Gtk.Template.Child()

    def __init__(self, tier, tier_details):
        super(Gtk.Grid, self).__init__()
        self.init_template()

        self.tier_name.set_markup(f"<b>{tier_names[tier]}</b>")

        active_period = tier_details.get('active_period')
        funds_needed_in_seconds = tier_details.get('funds_needed_in_seconds')

        status = 'Active' if active_period else 'Inactive'
        details = ''
        if active_period:
            details += f"({period_names[active_period]})"
            if funds_needed_in_seconds is not None and funds_needed_in_seconds > 0:
                time_remaining = time_remaining_text(funds_needed_in_seconds) 
                if time_remaining: details += f", {time_remaining} remaining"
        self.tier_status.set_markup(f" - <i>{status}</i> {details}")

        funds_needed_markup = ''
        first_period = True
        for period, amount in tier_details['funds_needed_by_period'].items():
            if not first_period:
                funds_needed_markup += ', '
            amount_text = f"${amount}USD" if amount > 0 else 'Already funded'
            funds_needed_markup += f"{period}: {amount_text}"
            first_period = False
        self.tier_funds_needed_usd.set_markup(funds_needed_markup)

def time_remaining_text(seconds):
    if not seconds:
        return

    if seconds < 60 * 60:
        return 'less than an hour'
    elif seconds / 60 * 60 < 24:
        time_remaining = seconds / 60 * 60
        return '1 hour' if time_remaining == 1 else f'{time_remaining} hours'
    elif seconds / 24 * 60 * 60 < 30:
        time_remaining = seconds / 24 * 60 * 60
        return '1 day' if time_remaining == 1 else f'{time_remaining} days'
    else:
        return