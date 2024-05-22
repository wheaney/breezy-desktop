from math import floor

# we'll begin to alert the user when there's less than a week left
LICENSE_WARN_SECONDS = 60 * 60 * 24 * 7

def time_remaining_text(seconds):
    if not seconds:
        return

    if seconds / 60 < 60:
        return 'less than an hour'
    elif seconds / (60 * 60) < 24:
        time_remaining = floor(seconds / (60 * 60))
        return '1 hour' if time_remaining == 1 else f'{time_remaining} hours'
    elif seconds / (24 * 60 * 60) < 30:
        time_remaining = floor(seconds / (24 * 60 * 60))
        return '1 day' if time_remaining == 1 else f'{time_remaining} days'
    else:
        return