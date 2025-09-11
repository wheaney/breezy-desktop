from gi.repository import Adw

from .time import time_remaining_text
import gettext

_ = gettext.gettext

class LicenseFeatureRow(Adw.ActionRow):

    def __init__(self, feature, feature_details):
        super().__init__()

        self.set_title(self._feature_name(feature))

        status = _('Disabled')
        is_trial = feature_details.get('is_trial') == True
        if feature_details.get('is_enabled') == True:
            status = _('In trial') if is_trial else _('Enabled')

        details = ''
        funds_needed_in_seconds = feature_details.get('funds_needed_in_seconds')
        if funds_needed_in_seconds is not None and funds_needed_in_seconds > 0:
            time_remaining = time_remaining_text(funds_needed_in_seconds, is_trial) 
            if time_remaining: details = _(" ({time_remaining} remaining)").format(time_remaining=time_remaining)

        self.set_subtitle(f"{status}{details}")

    def _feature_name(self, feature):
        feature_names = {
            'sbs': lambda: _('Side-by-side mode (gaming)'),
            'smooth_follow': lambda: _('Smooth Follow (gaming)'),
            'productivity_basic': lambda: _('Breezy Desktop (productivity)')
        }
        return feature_names[feature]()