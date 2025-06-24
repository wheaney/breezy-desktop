/*
    SPDX-FileCopyrightText: 2022 Vlad Zahorodnii <vlad.zahorodnii@kde.org>

    SPDX-License-Identifier: GPL-2.0-only OR GPL-3.0-only OR LicenseRef-KDE-Accepted-GPL
*/

import QtQuick
import QtQuick3D
import org.kde.kwin as KWinComponents

Node {
    id: cube

    property real faceDisplacement: 100
    required property size faceSize
    readonly property real faceDistance: 0.5 * faceSize.width / Math.tan(angleTick * Math.PI / 360) + faceDisplacement;
    readonly property real angleTick: 360 / faceRepeater.count

    function screenAt(azimuth) {
        let index = Math.round(azimuth / angleTick) % faceRepeater.count;
        if (index < 0) {
            index += faceRepeater.count;
        }
        return faceRepeater.objectAt(index).screen;
    }

    function screenAzimuth(screen) {
        return cube.angleTick * screen.index;
    }

    Repeater3D {
        id: faceRepeater
        model: KWinComponents.Workspace.screens.length
        delegate: CubeFace {
            property var screen: KWinComponents.Workspace.screens[index]
            faceSize: cube.faceSize
            scale: Qt.vector3d(faceSize.width / 100, faceSize.height / 100, 1)
            eulerRotation.y: cube.angleTick * index
            position: {
                const transform = Qt.matrix4x4();
                transform.rotate(cube.angleTick * index, Qt.vector3d(0, 1, 0));
                return transform.times(Qt.vector3d(0, 0, cube.faceDistance));
            }
        }
    }
}
