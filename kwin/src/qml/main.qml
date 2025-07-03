/*
    SPDX-FileCopyrightText: 2022 Vlad Zahorodnii <vlad.zahorodnii@kde.org>

    SPDX-License-Identifier: GPL-2.0-only OR GPL-3.0-only OR LicenseRef-KDE-Accepted-GPL
*/

import QtQuick
import QtQuick3D
import org.kde.kwin as KWinComponents
import org.kde.kwin.effect.cube

Item {
    id: root
    antialiasing: true
    focus: false

    required property QtObject effect
    required property QtObject targetScreen

    property bool animationEnabled: false

    function start() {
        root.animationEnabled = true;
    }

    function stop() {
    }

    function switchToSelected() {
        // const eulerRotation = cameraController.rotation.toEulerAngles();
        // const desktop = cube.screenAt(eulerRotation.y);
        // KWinComponents.Workspace.currentDesktop = desktop;
        // effect.deactivate();
    }

    View3D {
        id: view
        anchors.fill: parent

        PerspectiveCamera { 
            id: camera
            fieldOfView: 22.55
        }

        Cube {
            id: cube
            viewportFOVHorizontal: 40.09
            viewportWidth: 1920
            viewportHeight: 1080
        }

        CubeCameraController {
            id: cameraController
            anchors.fill: parent
            camera: camera
            radius: 0.5 * cube.viewportHeight / Math.tan(camera.fieldOfView * Math.PI / 360)

            Behavior on rotation {
                enabled: !cameraController.busy && root.animationEnabled
                QuaternionAnimation {
                    id: rotationAnimation
                    duration: effect.animationDuration
                    easing.type: Easing.OutCubic
                }
            }
            Behavior on radius {
                NumberAnimation {
                    duration: effect.animationDuration
                    easing.type: Easing.OutCubic
                }
            }

            function rotateTo(desktop) {
                if (rotationAnimation.running) {
                    return;
                }
                rotation = Quaternion.fromEulerAngles(0, 0, 0);
            }
        }
    }

    Component.onCompleted: start();
}
