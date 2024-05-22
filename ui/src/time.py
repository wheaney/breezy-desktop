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