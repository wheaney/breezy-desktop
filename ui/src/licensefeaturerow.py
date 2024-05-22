from gi.repository import Adw, Gtk

from .time import time_remaining_text

FEATURE_NAMES = {
    'sbs': 'Side-by-side mode (for gaming)',
    'smooth_follow': 'Smooth Follow',
    'productivity_basic': 'Breezy Desktop',
    'productivity_pro': 'Breezy Desktop w/ multiple monitors',
}

class LicenseFeatureRow(Adw.ActionRow):

    def __init__(self, feature, feature_details):
        super().__init__()

        self.set_title(FEATURE_NAMES[feature])

        status = 'Disabled'
        if feature_details.get('is_enabled') == True:
            status = 'In trial' if feature_details.get('is_trial') == True else 'Enabled'

        details = ''
        funds_needed_in_seconds = feature_details.get('funds_needed_in_seconds')
        if funds_needed_in_seconds is not None and funds_needed_in_seconds > 0:
            time_remaining = time_remaining_text(funds_needed_in_seconds) 
            if time_remaining: details = f" ({time_remaining} remaining)"

        self.set_subtitle(f"{status}{details}")
