from gi.repository import Adw, Gtk

from .time import time_remaining_text
import gettext

_ = gettext.gettext

PERIOD_RANKS = {
    'monthly': 1,
    'yearly': 2,
    'lifetime': 3,
}

class LicenseTierRow(Adw.ExpanderRow):

    def __init__(self, tier, tier_details):
        super().__init__()

        self.set_title(self._tier_name(tier))

        active_period = tier_details.get('active_period')
        funds_needed_in_seconds = tier_details.get('funds_needed_in_seconds')

        status = _('Active') if active_period else _('Inactive')
        details = ''
        if active_period:
            details += f" {self._period_description[active_period]}"
            if funds_needed_in_seconds is not None and funds_needed_in_seconds > 0:
                time_remaining = time_remaining_text(funds_needed_in_seconds) 
                if time_remaining: details += _(" ({time_remaining} remaining)").format(time_remaining=time_remaining)
            if active_period == 'lifetime':
                self.set_enable_expansion(False)
                self.set_icon_name(None)

        self.set_expanded(False)
        self.set_subtitle(f"{status}{details}")

        for period, amount in tier_details['funds_needed_by_period'].items():
            amount_text = None
            if amount > 0:
                amount_text = _("<b>${amount}</b> USD").format(amount=amount)
                if active_period == period:
                    amount_text += _(" to renew")
                elif active_period is not None:
                    amount_text += _(" to upgrade")
            elif active_period is not None and PERIOD_RANKS[period] >= PERIOD_RANKS[active_period]:
                amount_text = _("Paid through next renewal period")

            if amount_text is not None:
                row_widget = Adw.ActionRow(title=self._period_name(period))
                row_widget.add_suffix(Gtk.Label(label=amount_text, use_markup=True))
                self.add_row(row_widget)

    def _tier_name(self, tier):
        tier_names = {
            'supporter': _('Gaming'),
            'subscriber': _('Productivity')
        }
        return tier_names[tier]

    def _period_description(self, period):
        period_descriptions = {
            'monthly': _(' - renewing monthly'),
            'yearly': _(' - renewing yearly'),
            'lifetime': _('with lifetime access'),
        }

        return period_descriptions[period]

    def _period_name(self, period):
        period_names = {
            'monthly': _('Monthly'),
            'yearly': _('Yearly'),
            'lifetime': _('Lifetime'),
        }

        return period_names[period]

