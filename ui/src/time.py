from math import floor
import gettext

_ = gettext.gettext

# we'll begin to alert the user when there's less than a week left
LICENSE_WARN_SECONDS = 60 * 60 * 24 * 7

def time_remaining_text(seconds, no_cap=False):
    if not seconds:
        return

    if seconds / 60 < 60:
        return _('less than an hour')
    elif seconds / (60 * 60) < 24:
        time_remaining = floor(seconds / (60 * 60))
        return _('1 hour') if time_remaining == 1 else _("{time_remaining} hours").format(time_remaining=time_remaining)
    elif seconds / (24 * 60 * 60) < 30 or no_cap:
        time_remaining = floor(seconds / (24 * 60 * 60))
        return _('1 day') if time_remaining == 1 else _("{time_remaining} days").format(time_remaining=time_remaining)
    else:
        return