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
        model: breezyDesktop.screens.length
        delegate: BreezyDesktopDisplay {
            screen: breezyDesktop.screens[index]
            monitorPlacement: breezyDesktop.monitorPlacements[index]
            property real monitorDistance: effect.allDisplaysDistance
            property real targetDistance: effect.allDisplaysDistance
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

    Timer {
        interval: 500 // 500ms - 2x per second to avoid running this check too frequently
        repeat: true
        running: true
        onTriggered: {
            if (breezyDesktop.imuRotations && breezyDesktop.imuRotations.length > 0) {
                let focusedIndex = -1;

                if (effect.zoomOnFocusEnabled) {
                    focusedIndex = displays.findFocusedMonitor(
                        displays.eusToNwuQuat(breezyDesktop.imuRotations[0]), 
                        breezyDesktop.monitorPlacements.map(monitorVectors => monitorVectors.centerLook), 
                        breezyDesktop.focusedMonitorIndex,
                        false, // TODO smooth follow
                        breezyDesktop.fovDetails,
                        breezyDesktop.screens.map(screen => screen.geometry)
                    );
                }

                if (focusedIndex !== breezyDesktop.focusedMonitorIndex) {
                    const unfocusedIndex = breezyDesktop.focusedMonitorIndex;
                    const focusedDisplay = focusedIndex !== -1 ? breezyDesktop.displayAtIndex(focusedIndex) : null;
                    const allDisplaysDistanceBinding = Qt.binding(function() { return effect.allDisplaysDistance; });
                    const focusedDisplayDistanceBinding = Qt.binding(function() { return effect.focusedDisplayDistance; });
                    if (focusedDisplay === null) {
                        const unfocusedDisplay = breezyDesktop.displayAtIndex(unfocusedIndex);
                        zoomOutAnimation.target = unfocusedDisplay;
                        zoomOutAnimation.target.targetDistance = effect.allDisplaysDistance;
                        zoomOutAnimation.onFinished.connect(function() {
                            unfocusedDisplay.monitorDistance = allDisplaysDistanceBinding;
                        });
                        zoomOutAnimation.start();
                    } else {
                        if (unfocusedIndex === -1) {
                            zoomInAnimation.target = focusedDisplay;
                            focusedDisplay.targetDistance = effect.focusedDisplayDistance;
                            zoomInAnimation.onFinished.connect(function() {
                                focusedDisplay.monitorDistance = focusedDisplayDistanceBinding;
                            });
                            zoomInAnimation.start();
                        } else {
                            const focusedDisplay = breezyDesktop.displayAtIndex(focusedIndex);
                            zoomInSeqAnimation.target = focusedDisplay;
                            focusedDisplay.targetDistance = effect.focusedDisplayDistance;

                            const unfocusedDisplay = breezyDesktop.displayAtIndex(unfocusedIndex);
                            zoomOutSeqAnimation.target = unfocusedDisplay;
                            zoomOutSeqAnimation.target.targetDistance = effect.allDisplaysDistance;
                            
                            zoomOnFocusSequence.onFinished.connect(function() {
                                focusedDisplay.monitorDistance = focusedDisplayDistanceBinding;
                                unfocusedDisplay.monitorDistance = allDisplaysDistanceBinding;
                            });

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
        to: effect.allDisplaysDistance
        duration: 150
        running: false
    }

    NumberAnimation {
        id: zoomInAnimation
        property: "monitorDistance"
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
            to: effect.allDisplaysDistance
            duration: 150
        }
        PauseAnimation { duration: 50 }
        NumberAnimation {
            id: zoomInSeqAnimation
            property: "monitorDistance"
            to: effect.focusedDisplayDistance
            duration: 300
        }
    }
}
