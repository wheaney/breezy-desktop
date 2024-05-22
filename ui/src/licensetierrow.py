from gi.repository import Adw, Gtk

from .time import time_remaining_text

TIER_NAMES = {
    'supporter': 'Gaming',
    'subscriber': 'Productivity',
    'subscriber_pro': 'Productivity Pro',
}

PERIOD_DESCRIPTIONS = {
    'monthly': ' - renewing monthly',
    'yearly': ' - renewing yearly',
    'lifetime': 'with lifetime access',
}

PERIOD_RANKS = {
    'monthly': 1,
    'yearly': 2,
    'lifetime': 3,
}

class LicenseTierRow(Adw.ExpanderRow):

    def __init__(self, tier, tier_details):
        super().__init__()

        self.set_title(TIER_NAMES[tier])

        active_period = tier_details.get('active_period')
        funds_needed_in_seconds = tier_details.get('funds_needed_in_seconds')

        status = 'Active' if active_period else 'Inactive'
        details = ''
        if active_period:
            details += f" {PERIOD_DESCRIPTIONS[active_period]}"
            if funds_needed_in_seconds is not None and funds_needed_in_seconds > 0:
                time_remaining = time_remaining_text(funds_needed_in_seconds) 
                if time_remaining: details += f" ({time_remaining} remaining)"
            if active_period == 'lifetime':
                self.set_enable_expansion(False)
                self.set_icon_name(None)

        self.set_expanded(False)
        self.set_subtitle(f"{status}{details}")

        for period, amount in tier_details['funds_needed_by_period'].items():
            amount_text = None
            if amount > 0:
                amount_text = f"<b>${amount}</b> USD"
                if active_period == period:
                    amount_text += " to renew"
                elif active_period is not None:
                    amount_text += " to upgrade"
            elif active_period is not None and PERIOD_RANKS[period] >= PERIOD_RANKS[active_period]:
                amount_text = "Ready to auto-renew"

            if amount_text is not None:
                row_widget = Adw.ActionRow(title=period.capitalize())
                row_widget.add_suffix(Gtk.Label(label=amount_text, use_markup=True))
                self.add_row(row_widget)


