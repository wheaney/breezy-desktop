import QtQuick
import QtQuick3D


Node {
    id: breezyDesktop
    
    property var viewportResolution: effect.displayResolution
    property var screens: root.screens
    property var fovDetails: root.fovDetails
    property var monitorPlacements: root.monitorPlacements
    property var imuRotations: effect.imuRotations
    property int focusedMonitorIndex: -1

    // x value for placing the viewport in the middle of all screens
    property real screensXMid: {
        let xMin = Number.MAX_VALUE;
        let xMax = Number.MIN_VALUE;

        for (let i = 0; i < screens.length; i++) {
            const geometry = screens[i].geometry;
            xMin = Math.min(xMin, geometry.x);
            xMax = Math.max(xMax, geometry.x + geometry.width);
        }

        return (xMin + xMax) / 2 - (viewportResolution[0] / 2);
    }

    // y value for placing the viewport in the middle of all screens
    property real screensYMid: {
        let yMin = Number.MAX_VALUE;
        let yMax = Number.MIN_VALUE;

        for (let i = 0; i < screens.length; i++) {
            const geometry = screens[i].geometry;
            yMin = Math.min(yMin, geometry.y);
            yMax = Math.max(yMax, geometry.y + geometry.height);
        }

        return (yMin + yMax) / 2 - (viewportResolution[1] / 2);
    }

    Displays {
        id: displays
    }

    function displayAtIndex(index) {
        if (index < 0 || index >= screens.length) {
            return null;
        }
        return breezyDesktopDisplays.objectAt(index);
    }

    Repeater3D {
        id: breezyDesktopDisplays
        model: screens.length
        delegate: BreezyDesktopDisplay {
            screen: screens[index]
            monitorPlacement: monitorPlacements[index]
            property real monitorDistance: effect.allDisplaysDistance
            property real screenRotationY: displays.radianToDegree(monitorPlacement.rotationAngleRadians.y)
            property real screenRotationX: displays.radianToDegree(monitorPlacement.rotationAngleRadians.x)

            property vector3d screenScale: {
                const geometry = screen.geometry;

                // apparently the default model unit size is 100x100, so we scale it up to the screen size
                return Qt.vector3d(geometry.width / 100, geometry.height / 100, 1);
            }

            scale: screenScale
            eulerRotation.y: screenRotationY
            eulerRotation.x: screenRotationX
            position: {
                // camera looks along the negative Z axis
                const positionVector = 
                    displays.nwuToEusVector(monitorPlacement.centerNoRotate)
                            .times(monitorDistance / effect.allDisplaysDistance);

                // position vector is only translated in flat directions, without rotations applied, so apply them here
                const rotationMatrix = Qt.matrix4x4();

                // only one of these should ever be non-zero, since we only rotate in the direction of the "wrap" preference
                rotationMatrix.rotate(screenRotationY, Qt.vector3d(0, 1, 0));
                rotationMatrix.rotate(screenRotationX, Qt.vector3d(1, 0, 0));

                return rotationMatrix.times(positionVector);
            }
        }
    }

    FrameAnimation {
        running: true
        onTriggered: {
            if (breezyDesktop.imuRotations && breezyDesktop.imuRotations.length > 0) {
                const focusedIndex = displays.findFocusedMonitor(
                    displays.eusToNwuQuat(breezyDesktop.imuRotations[0]), 
                    breezyDesktop.monitorPlacements.map(monitorVectors => monitorVectors.centerLook), 
                    breezyDesktop.focusedMonitorIndex,
                    false, // TODO smooth follow
                    breezyDesktop.fovDetails,
                    breezyDesktop.screens.map(screen => screen.geometry)
                );

                console.log(`\t\t\tBreezy - Next focused monitor index: ${focusedIndex}`);
                if (focusedIndex !== breezyDesktop.focusedMonitorIndex) {
                    zoomOutAnimation.stop();
                    zoomInAnimation.stop();
                    zoomOnFocusSequence.stop();
                    if (focusedIndex === -1) {
                        zoomOutAnimation.target = breezyDesktop.displayAtIndex(breezyDesktop.focusedMonitorIndex);
                        zoomOutAnimation.start();
                    } else {
                        if (breezyDesktop.focusedMonitorIndex === -1) {
                            zoomInAnimation.target = breezyDesktop.displayAtIndex(focusedIndex);
                            zoomInAnimation.start();
                        } else {
                            zoomInSeqAnimation.target = breezyDesktop.displayAtIndex(focusedIndex);
                            zoomOutSeqAnimation.target = breezyDesktop.displayAtIndex(breezyDesktop.focusedMonitorIndex);
                            zoomOnFocusSequence.start();
                        }
                    }
                    breezyDesktop.focusedMonitorIndex = focusedIndex;
                }
            }
        }
    }

    NumberAnimation {
        id: zoomOutAnimation
        property: "monitorDistance"
        from: effect.focusedDisplayDistance
        to: effect.allDisplaysDistance
        duration: 150
        running: false
    }

    NumberAnimation {
        id: zoomInAnimation
        property: "monitorDistance"
        from: effect.allDisplaysDistance
        to: effect.focusedDisplayDistance
        duration: 300
        running: false
    }

    SequentialAnimation {
        id: zoomOnFocusSequence
        running: false

        NumberAnimation {
            id: zoomOutSeqAnimation
            property: "monitorDistance"
            from: effect.focusedDisplayDistance
            to: effect.allDisplaysDistance
            duration: 150
        }
        PauseAnimation { duration: 50 }
        NumberAnimation {
            id: zoomInSeqAnimation
            property: "monitorDistance"
            from: effect.allDisplaysDistance
            to: effect.focusedDisplayDistance
            duration: 300
        }
    }
}
