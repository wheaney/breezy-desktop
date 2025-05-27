/*
    SPDX-FileCopyrightText: 2022 Vlad Zahorodnii <vlad.zahorodnii@kde.org>

    SPDX-License-Identifier: GPL-2.0-only OR GPL-3.0-only OR LicenseRef-KDE-Accepted-GPL
*/

import QtQuick
import QtQuick3D

Item {
    id: root

    readonly property bool busy: status.useMouse

    required property Camera camera

    property quaternion rotation: Quaternion.fromEulerAngles(0, 0, 0)
    property real radius: 2000

    property real speed: 1
    property real xSpeed: 0.1
    property real ySpeed: 0.1

    property bool xInvert: false
    property bool yInvert: false

    implicitWidth: parent.width
    implicitHeight: parent.height

    onRotationChanged: root.updateCamera();
    onRadiusChanged: root.updateCamera();

    DragHandler {
        id: dragHandler
        target: null
        acceptedModifiers: Qt.NoModifier
        onCentroidChanged: {
            mouseMoved(Qt.vector2d(centroid.position.x, centroid.position.y), false);
        }

        onActiveChanged: {
            if (active) {
                mousePressed(Qt.vector2d(centroid.position.x, centroid.position.y));
            } else {
                mouseReleased(Qt.vector2d(centroid.position.x, centroid.position.y));
            }
        }
    }

    WheelHandler {
        id: wheelHandler
        orientation: Qt.Vertical
        target: null
        onWheel: event => {
            let delta = -event.angleDelta.y * 0.01;
            root.radius += root.radius * 0.1 * delta
        }
    }

    TapHandler {
        onTapped: root.forceActiveFocus()
    }

    function mousePressed(newPos) {
        root.forceActiveFocus()
        status.currentPos = newPos
        status.lastPos = newPos
        status.useMouse = true;
    }

    function mouseReleased(newPos) {
        status.useMouse = false;
    }

    function mouseMoved(newPos: vector2d) {
        status.currentPos = newPos;
    }

    function processInputs() {
        if (root.busy) {
            status.processInput();
        }
    }

    function updateCamera() {
        const eulerRotation = root.rotation.toEulerAngles();
        const theta = (eulerRotation.x + 90) * Math.PI / 180;
        const phi = eulerRotation.y * Math.PI / 180;

        camera.position = Qt.vector3d(radius * Math.sin(phi) * Math.sin(theta),
                                      radius * Math.cos(theta),
                                      radius * Math.cos(phi) * Math.sin(theta));
        camera.rotation = root.rotation;
    }

    Timer {
        interval: 16
        repeat: true
        running: root.busy
        onTriggered: {
            processInputs();
        }
    }

    QtObject {
        id: status

        property bool useMouse: false

        property real minElevation: -30
        property real maxElevation: 30

        property vector2d lastPos: Qt.vector2d(0, 0)
        property vector2d currentPos: Qt.vector2d(0, 0)

        function processInput() {
            if (useMouse) {
                const eulerRotation = root.rotation.toEulerAngles();

                const pixelDelta = Qt.vector2d(lastPos.x - currentPos.x,
                                               lastPos.y - currentPos.y);
                lastPos = currentPos;

                let azimuthDelta = pixelDelta.x * xSpeed
                if (xInvert) {
                    azimuthDelta = -azimuthDelta;
                }
                let azimuth = (eulerRotation.y + azimuthDelta) % 360;

                let elevationDelta = pixelDelta.y * ySpeed
                if (yInvert) {
                    elevationDelta = -elevationDelta;
                }

                let elevation = eulerRotation.x + elevationDelta;
                if (elevation < minElevation) {
                    elevation = minElevation;
                } else if (elevation > maxElevation) {
                    elevation = maxElevation;
                }

                root.rotation = Quaternion.fromEulerAngles(elevation, azimuth, 0);
            }
        }
    }
}