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
}
