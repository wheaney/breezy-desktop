/*
    SPDX-FileCopyrightText: 2022 Vlad Zahorodnii <vlad.zahorodnii@kde.org>

    SPDX-License-Identifier: GPL-2.0-only OR GPL-3.0-only OR LicenseRef-KDE-Accepted-GPL
*/

import QtQuick
import QtQuick3D
import org.kde.kwin as KWinComponents

Node {
    id: cube

    required property real viewportFOVHorizontal
    required property real viewportWidth
    required property real viewportHeight
    property real distance: viewportWidth / (2 * Math.tan(Math.PI * viewportFOVHorizontal / 360))

    Repeater3D {
        id: faceRepeater
        model: KWinComponents.Workspace.screens.length
        delegate: CubeFace {
            screen: KWinComponents.Workspace.screens[index]
            
            property real screenRotation: {
                const geometry = screen.geometry;
                const rot = (viewportFOVHorizontal / viewportWidth) * geometry.x
                console.log(`\t\t\tBreezy - screenRotation ${geometry.x} ${geometry.width} ${rot}`);
                return -rot;
            }
            
            scale: Qt.vector3d(viewportWidth / 100, viewportHeight / 100, 1)
            eulerRotation.y: screenRotation
            
            position: {
                console.log(`\t\t\tBreezy - position ${distance} ${screenRotation}`);
                const transform = Qt.matrix4x4();
                transform.rotate(screenRotation, Qt.vector3d(0, 1, 0));
                const position = Qt.vector3d(0, 0, -distance);
                return transform.times(position).minus(position);
            }
        }
    }
}
