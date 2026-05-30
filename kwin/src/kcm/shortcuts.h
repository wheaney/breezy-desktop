#pragma once

#include <KLocalizedString>
#include <QKeySequence>
#include <Qt>
#include <QString>

namespace BreezyShortcuts {
    struct Shortcut {
        QKeySequence shortcut;
        QString actionName;
        const char *actionText;
    };

    const Shortcut TOGGLE = {
        Qt::CTRL | Qt::META | Qt::Key_Backslash,
        QStringLiteral("Toggle XR Effect"),
        I18N_NOOP("Toggle XR Effect")
    };

    const Shortcut RECENTER = {
        Qt::CTRL | Qt::META | Qt::Key_Space,
        QStringLiteral("Recenter"),
        I18N_NOOP("Recenter")
    };

    const Shortcut TOGGLE_ZOOM_ON_FOCUS = {
        Qt::CTRL | Qt::META | Qt::Key_0,
        QStringLiteral("Toggle Zoom on Focus"),
        I18N_NOOP("Toggle Zoom on Focus")
    };

    const Shortcut TOGGLE_FOLLOW_MODE = {
        Qt::CTRL | Qt::META | Qt::Key_Return,
        QStringLiteral("Toggle Follow Mode"),
        I18N_NOOP("Toggle Follow Mode")
    };

    const Shortcut CURSOR_TO_FOCUSED_DISPLAY = {
        Qt::CTRL | Qt::META | Qt::Key_Period,
        QStringLiteral("Move Cursor to Focused Display"),
        I18N_NOOP("Move Cursor to Focused Display")
    };
}
