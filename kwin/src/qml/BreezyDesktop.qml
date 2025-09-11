import QtQuick
import QtQuick3D


Node {
    id: breezyDesktop
    
    property var viewportResolution: effect.displayResolution
    required property var screens
    required property var fovDetails
    required property var monitorPlacements
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
            property real screenRotationY: displays.radianToDegree(monitorPlacement?.rotationAngleRadians.y ?? 0)
            property real screenRotationX: displays.radianToDegree(monitorPlacement?.rotationAngleRadians.x ?? 0)
            property matrix4x4 rotationMatrix: {
                const matrix = Qt.matrix4x4();
                matrix.rotate(screenRotationY, Qt.vector3d(0, 1, 0));
                matrix.rotate(screenRotationX, Qt.vector3d(1, 0, 0));
                return matrix;
            }

            property vector3d screenScale: {
                const geometry = screen.geometry;

                // apparently the default model unit size is 100x100, so we scale it up to the screen size
                return Qt.vector3d(geometry.width / 100, geometry.height / 100, 1);
            }

            scale: screenScale
            eulerRotation.y: screenRotationY
            eulerRotation.x: screenRotationX
            position: {
                if (!monitorPlacement) return Qt.vector3d(0, 0, 0);

                const displayNwu = 
                    monitorPlacement.centerNoRotate
                                    .times(monitorDistance / effect.allDisplaysDistance);


                return rotationMatrix.times(displays.nwuToEusVector(displayNwu));
            }
        }
    }

    Timer {
        interval: 500 // 500ms - 2x per second to avoid running this check too frequently
        repeat: true
        running: true
        onTriggered: {
            if (effect.imuRotations && effect.imuRotations.length > 0) {
                let focusedIndex = -1;

                if (effect.zoomOnFocusEnabled) {
                    focusedIndex = displays.findFocusedMonitor(
                        displays.eusToNwuQuat(effect.imuRotations[0]), 
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
                        zoomOutAnimation.start();
                    } else {
                        if (unfocusedIndex === -1) {
                            zoomInAnimation.target = focusedDisplay;
                            focusedDisplay.targetDistance = effect.focusedDisplayDistance;
                            zoomInAnimation.start();
                        } else {
                            zoomInSeqAnimation.target = focusedDisplay;
                            focusedDisplay.targetDistance = effect.focusedDisplayDistance;

                            const unfocusedDisplay = breezyDesktop.displayAtIndex(unfocusedIndex);
                            zoomOutSeqAnimation.target = unfocusedDisplay;
                            zoomOutSeqAnimation.target.targetDistance = effect.allDisplaysDistance;

                            zoomOnFocusSequence.start();
                        }
                    }
                    breezyDesktop.focusedMonitorIndex = focusedIndex;
                }
            }
        }
    }

    // release references to displays and stale indexes
    onScreensChanged: {
        breezyDesktop.focusedMonitorIndex = -1;
        zoomOutAnimation.stop();
        zoomInAnimation.stop();
        zoomOnFocusSequence.stop();

        zoomOutAnimation.target = null;
        zoomInAnimation.target = null;
        zoomOutSeqAnimation.target = null;
        zoomInSeqAnimation.target = null;
    }

    NumberAnimation {
        id: zoomOutAnimation
        property: "monitorDistance"
        to: effect.allDisplaysDistance
        duration: 150
        running: false
        onFinished: {
            const unfocusedDisplay = zoomOutAnimation.target;
            if (unfocusedDisplay) {
                unfocusedDisplay.monitorDistance = Qt.binding(function() { return effect.allDisplaysDistance; });
            }
        }
    }

    NumberAnimation {
        id: zoomInAnimation
        property: "monitorDistance"
        to: effect.focusedDisplayDistance
        duration: 300
        running: false
        onFinished: {
            const focusedDisplay = zoomInAnimation.target;
            if (focusedDisplay) {
                focusedDisplay.monitorDistance = Qt.binding(function() { return effect.focusedDisplayDistance; });
            }
        }
    }

    SequentialAnimation {
        id: zoomOnFocusSequence
        running: false
        onFinished: {
            const focusedDisplay = zoomInSeqAnimation.target;
            if (focusedDisplay) {
                focusedDisplay.monitorDistance = Qt.binding(function() { return effect.focusedDisplayDistance; });
            }
            const unfocusedDisplay = zoomOutSeqAnimation.target;
            if (unfocusedDisplay) {
                unfocusedDisplay.monitorDistance = Qt.binding(function() { return effect.allDisplaysDistance; });
            }
        }

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
