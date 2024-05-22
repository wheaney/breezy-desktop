from gi.repository import Gtk

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

@Gtk.Template(resource_path='/com/xronlinux/BreezyDesktop/gtk/license-tier-row.ui')
class LicenseTierRow(Gtk.Grid):
    __gtype_name__ = 'LicenseTierRow'

    tier_name = Gtk.Template.Child()
    tier_status = Gtk.Template.Child()
    tier_funds_needed = Gtk.Template.Child()
    tier_funds_needed_monthly_label = Gtk.Template.Child()
    tier_funds_needed_monthly_amount = Gtk.Template.Child()
    tier_funds_needed_yearly_label = Gtk.Template.Child()
    tier_funds_needed_yearly_amount = Gtk.Template.Child()
    tier_funds_needed_lifetime_label = Gtk.Template.Child()
    tier_funds_needed_lifetime_amount = Gtk.Template.Child()

    def __init__(self, tier, tier_details):
        super(Gtk.Grid, self).__init__()
        self.init_template()

        self.funds_needed_elements = {
            'monthly': [self.tier_funds_needed_monthly_label, self.tier_funds_needed_monthly_amount],
            'yearly': [self.tier_funds_needed_yearly_label, self.tier_funds_needed_yearly_amount],
            'lifetime': [self.tier_funds_needed_lifetime_label, self.tier_funds_needed_lifetime_amount],
        }

        self.tier_name.set_markup(f"<b>{TIER_NAMES[tier]}</b>")

        active_period = tier_details.get('active_period')
        funds_needed_in_seconds = tier_details.get('funds_needed_in_seconds')

        status = 'Active' if active_period else 'Inactive'
        details = ''
        if active_period:
            details += f" {PERIOD_DESCRIPTIONS[active_period]}"
            if funds_needed_in_seconds is not None and funds_needed_in_seconds > 0:
                time_remaining = time_remaining_text(funds_needed_in_seconds) 
                if time_remaining: details += f" ({time_remaining} remaining)"
            if active_period == 'lifetime' or funds_needed_in_seconds is None:
                self.tier_funds_needed.set_visible(False)

        self.tier_status.set_markup(f"{status}{details}")

        for period, amount in tier_details['funds_needed_by_period'].items():
            if amount > 0:
                label_widget, amount_widget = self.funds_needed_elements[period]
                amount_text = f"US${amount}"
                if active_period == period:
                    amount_text += " to renew"
                else:
                    amount_text += " to upgrade"
                amount_widget.set_markup(amount_text)
                label_widget.set_visible(True)
                amount_widget.set_visible(True)


