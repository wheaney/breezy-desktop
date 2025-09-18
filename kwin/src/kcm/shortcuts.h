#pragma once

#include <QKeySequence>
#include <Qt>
#include <QString>

namespace BreezyShortcuts {
    struct Shortcut {
        QKeySequence shortcut;
        QString actionName;
        QString actionText;
    };

    const Shortcut TOGGLE = {
        Qt::CTRL | Qt::META | Qt::Key_Backslash,
        QStringLiteral("Toggle XR Effect"),
        QStringLiteral("Toggle XR Effect")
    };

    const Shortcut RECENTER = {
        Qt::CTRL | Qt::META | Qt::Key_Space,
        QStringLiteral("Recenter"),
        QStringLiteral("Recenter")
    };

    const Shortcut TOGGLE_ZOOM_ON_FOCUS = {
        Qt::CTRL | Qt::META | Qt::Key_0,
        QStringLiteral("Toggle Zoom on Focus"),
        QStringLiteral("Toggle Zoom on Focus")
    };

    const Shortcut TOGGLE_FOLLOW_MODE = {
        Qt::CTRL | Qt::META | Qt::Key_Return,
        QStringLiteral("Toggle Follow Mode"),
        QStringLiteral("Toggle Follow Mode")
    };
}
