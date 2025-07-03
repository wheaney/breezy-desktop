/*
    SPDX-FileCopyrightText: 2022 Vlad Zahorodnii <vlad.zahorodnii@kde.org>

    SPDX-License-Identifier: GPL-2.0-only OR GPL-3.0-only OR LicenseRef-KDE-Accepted-GPL
*/

import QtQuick
import org.kde.kwin as KWinComponents

Item {
    id: desktopView

    required property QtObject screen

    Repeater {
        model: KWinComponents.WindowFilterModel {
            activity: KWinComponents.Workspace.currentActivity
            desktop: KWinComponents.Workspace.currentDesktop
            screenName: desktopView.screen.name
            windowModel: KWinComponents.WindowModel {}
        }

        KWinComponents.WindowThumbnail {
            wId: model.window.internalId
            x: model.window.x - desktopView.screen.geometry.x
            y: model.window.y - desktopView.screen.geometry.y
            z: model.window.stackingOrder
            visible: !model.window.minimized
        }
    }
}
