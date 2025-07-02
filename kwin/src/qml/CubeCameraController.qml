/*
    SPDX-FileCopyrightText: 2022 Vlad Zahorodnii <vlad.zahorodnii@kde.org>

    SPDX-License-Identifier: GPL-2.0-only OR GPL-3.0-only OR LicenseRef-KDE-Accepted-GPL
*/

import QtQuick
import QtQuick3D

Item {
    id: root

    required property Camera camera

    property quaternion rotation: Quaternion.fromEulerAngles(0, 0, 0)
    property real radius: 2000

    property real speed: 1
    property real xSpeed: 0.1
    property real ySpeed: 0.1

    implicitWidth: parent.width
    implicitHeight: parent.height

    onRotationChanged: root.updateCamera();
    onRadiusChanged: root.updateCamera();

    function updateCamera() {
        // convert NWU to EUS by passing root.rotation values: w, -y, z, -x
        let effectiveRotation = Qt.quaternion(root.rotation.scalar, -root.rotation.y, root.rotation.z, -root.rotation.x);
        
        const eulerRotation = effectiveRotation.toEulerAngles();
        const theta = 90 * Math.PI / 180;
        const phi = 0.0;

        camera.position = Qt.vector3d(radius * Math.sin(phi) * Math.sin(theta),
                                      radius * Math.cos(theta),
                                      radius * Math.cos(phi) * Math.sin(theta));
        camera.rotation = effectiveRotation;
    }

    // Add property to receive XR rotation from effect
    property quaternion xrRotation: effect.xrRotation
    property bool useXrRotation: true // Set to true to use XR rotation when available

    Timer {
        interval: 16
        repeat: true
        running: true
        onTriggered: {
            if (useXrRotation && xrRotation.length() > 0) {
                root.rotation = xrRotation;
            }
        }
    }
}
