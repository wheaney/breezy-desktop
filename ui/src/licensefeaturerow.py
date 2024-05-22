from gi.repository import Gtk

from .time import time_remaining_text

feature_names = {
    'sbs': 'Side-by-side mode (gaming)',
    'smooth_follow': 'Smooth Follow (gaming)',
    'productivity_basic': 'Breezy Desktop',
    'productivity_pro': 'Breezy Desktop w/ multiple monitors',
}

@Gtk.Template(resource_path='/com/xronlinux/BreezyDesktop/gtk/license-feature-row.ui')
class LicenseFeatureRow(Gtk.Grid):
    __gtype_name__ = 'LicenseFeatureRow'

    feature_name = Gtk.Template.Child()
    feature_status = Gtk.Template.Child()

    def __init__(self, feature, feature_details):
        super(Gtk.Grid, self).__init__()
        self.init_template()

        self.feature_name.set_markup(f"<b>{feature_names[feature]}</b>")


        status = 'Disabled'
        if feature_details.get('is_enabled') == True:
            status = 'In trial' if feature_details.get('is_trial') == True else 'Enabled'

        details = ''
        funds_needed_in_seconds = feature_details.get('funds_needed_in_seconds')
        if funds_needed_in_seconds is not None and funds_needed_in_seconds > 0:
            time_remaining = time_remaining_text(funds_needed_in_seconds) 
            if time_remaining: details = f" ({time_remaining} remaining)"

        self.feature_status.set_markup(f"{status}{details}")
