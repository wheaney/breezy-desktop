import QtQuick
import QtQuick3D


Node {
    id: breezyDesktop
    
    property var viewportResolution: effect.displayResolution
    property bool smoothFollowEnabled: effect.smoothFollowEnabled
    required property var screens
    required property var fovDetails
    required property var monitorPlacements
    property int focusedMonitorIndex: -1
    property int lookingAtMonitorIndex: -1
    property var smoothFollowFocusedDisplay

    Displays {
        id: displays
    }

    function displayAtIndex(index) {
        if (index < 0 || index >= screens.length) {
            return null;
        }
        return breezyDesktopDisplays.objectAt(index);
    }

    function updateFocus(smoothFollowEnabledChanged = false) {
        const rotations = smoothFollowEnabled ? effect.smoothFollowOrigin : effect.imuRotations;
        if (rotations && rotations.length > 0) {
            let focusedIndex = -1;
            let lookingAtIndex = -1;

            lookingAtIndex = displays.findFocusedMonitor(
                displays.eusToNwuQuat(rotations[0]), 
                breezyDesktop.monitorPlacements.map(monitorVectors => monitorVectors.centerLook), 
                breezyDesktop.focusedMonitorIndex,
                smoothFollowEnabled,
                breezyDesktop.fovDetails,
                breezyDesktop.screens.map(screen => screen.geometry)
            );

            if (breezyDesktop.lookingAtMonitorIndex !== lookingAtIndex) {
                breezyDesktop.lookingAtMonitorIndex = lookingAtIndex;
                effect.lookingAtScreenIndex = lookingAtIndex;
            }

            if (effect.zoomOnFocusEnabled || smoothFollowEnabled) {
                focusedIndex = lookingAtIndex;
            }

            let focusedDisplay;
            let unfocusedDisplay;
            let startSmoothFollowFocusAnimation = false;
            if (smoothFollowEnabledChanged) {
                let targetDisplay;
                let targetProgress;
                if (smoothFollowEnabled && focusedIndex !== -1) {
                    focusedDisplay = breezyDesktop.displayAtIndex(focusedIndex);
                    targetDisplay = focusedDisplay;
                    targetProgress = 1.0;
                    startSmoothFollowFocusAnimation = true;
                } else if (!smoothFollowEnabled && breezyDesktop.focusedMonitorIndex !== -1) {
                    unfocusedDisplay = breezyDesktop.displayAtIndex(breezyDesktop.focusedMonitorIndex);
                    targetDisplay = unfocusedDisplay;
                    targetProgress = 0.0;
                }
                smoothFollowTransitionAnimation.stop();
                smoothFollowTransitionAnimation.target = targetDisplay;
                smoothFollowTransitionAnimation.from = targetDisplay.smoothFollowTransitionProgress;
                smoothFollowTransitionAnimation.to = targetProgress;
                smoothFollowTransitionAnimation.start();
            }

            if (focusedIndex !== breezyDesktop.focusedMonitorIndex) {
                const unfocusedIndex = breezyDesktop.focusedMonitorIndex;
                if (!focusedDisplay) focusedDisplay = focusedIndex !== -1 ? breezyDesktop.displayAtIndex(focusedIndex) : null;
                const allDisplaysDistanceBinding = Qt.binding(function() { return effect.allDisplaysDistance; });
                const focusedDisplayDistanceBinding = Qt.binding(function() { return effect.focusedDisplayDistance; });
                if (focusedDisplay === null) {
                    if (!unfocusedDisplay) unfocusedDisplay = breezyDesktop.displayAtIndex(unfocusedIndex);
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

                        if (!unfocusedDisplay) unfocusedDisplay = breezyDesktop.displayAtIndex(unfocusedIndex);
                        zoomOutSeqAnimation.target = unfocusedDisplay;
                        zoomOutSeqAnimation.target.targetDistance = effect.allDisplaysDistance;

                        zoomOnFocusSequence.start();
                    }
                }
                breezyDesktop.focusedMonitorIndex = focusedIndex;
            }

            if (startSmoothFollowFocusAnimation) smoothFollowFocusedAnimation.restart();
        }
    }

    // monitorPlacement assumed to be present
    function displayEusVector(display) {
        const displayNwu = 
            display.monitorPlacement.centerNoRotate
                                    .times(display.monitorDistance / effect.allDisplaysDistance);

        return displays.nwuToEusVector(displayNwu);
    }

    function displayRotationVector(display, eusVector) {
        return display.rotationMatrix.times(eusVector);
    }

    // smoothFollowOrigin is the rotation away from the original placement of the displays
    // imuRotations is the smooth follow rotation relative to the camera (very near an identity quat)
    // subtract the latter from the former to get the complete rotation
    function smoothFollowQuat() {
        return effect.smoothFollowOrigin[0].times(effect.imuRotations[0].conjugated());
    }

    function displaySmoothFollowVector(display, eusVector) {
        return smoothFollowQuat().times(eusVector);
    }

    // don't call this from the delegate to avoid binding the position property to the effect properties 
    // used for smooth follow
    function displayPosition(display, smoothFollowRotation) {
        const displayEus = displayEusVector(display);

        // short circuit to avoid slerping if not needed
        if (display.smoothFollowTransitionProgress === 1.0) {
            return displaySmoothFollowVector(display, displayEus, smoothFollowRotation);
        }

        const finalPosition = displays.slerpVector(
            displayRotationVector(display, displayEus), 
            displaySmoothFollowVector(display, displayEus, smoothFollowRotation),
            display.smoothFollowTransitionProgress
        );

        return finalPosition
    }

    Repeater3D {
        id: breezyDesktopDisplays
        model: breezyDesktop.screens.length
        delegate: BreezyDesktopDisplay {
            screen: breezyDesktop.screens[index]
            monitorPlacement: breezyDesktop.monitorPlacements[index]
            fovDetails: breezyDesktop.fovDetails
            
            property real smoothFollowTransitionProgress: 0.0
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

            eulerRotation.y: screenRotationY
            eulerRotation.x: screenRotationX
            position: {
                if (!monitorPlacement) return Qt.vector3d(0, 0, 0);

                return displayRotationVector(this, displayEusVector(this));
            }
        }
    }

    // smoothFollowEnabled gets cleared before the IMU begins slerping back to the origin so we can't just 
    // switch off smooth follow logic based on this flag. Instead, we have to rely on 
    // smoothFollowTransitionProgress to determine how much of the IMU positions to apply.
    onSmoothFollowEnabledChanged: {
        updateFocus(true);
    }

    FrameAnimation {
        id: smoothFollowFocusedAnimation
        running: false
        onTriggered: {
            if (!breezyDesktop.smoothFollowFocusedDisplay && breezyDesktop.focusedMonitorIndex !== -1) {
                breezyDesktop.smoothFollowFocusedDisplay = breezyDesktopDisplays.objectAt(breezyDesktop.focusedMonitorIndex)
            }

            let continueRunning = false;
            const focusedDisplay = breezyDesktop.smoothFollowFocusedDisplay;
            if (focusedDisplay) {
                continueRunning = focusedDisplay.smoothFollowTransitionProgress > 0.0;
                if (continueRunning) {
                    const smoothFollowRotation = smoothFollowQuat();
                    focusedDisplay.eulerRotation = Qt.vector3d(0, 0, 0);
                    focusedDisplay.rotation = smoothFollowRotation;

                    // When smooth follow is running, we're updating the position of the display manually
                    // on every frame (avoid binding to a function that uses non-notify effect properties
                    // imuRotations and smoothFollowOrigin).
                    focusedDisplay.position = displayPosition(focusedDisplay, smoothFollowRotation);
                } else {
                    focusedDisplay.rotation = Qt.quaternion(1, 0, 0, 0);
                    focusedDisplay.eulerRotation.x = focusedDisplay.screenRotationX;
                    focusedDisplay.eulerRotation.y = focusedDisplay.screenRotationY;
                    focusedDisplay.eulerRotation.z = 0.0;

                    // When smooth follow is done, this frame animation will no longer run so we need to
                    // rebind a safe function to the position property that will automatically update the 
                    // position when delegate properties change. display properties don't often change,
                    // but zoomOnFocus does change monitorDistance, so we need the binding to pick that up.
                    focusedDisplay.position = Qt.binding(function() { 
                        return displayRotationVector(this, displayEusVector(this)); 
                    }.bind(focusedDisplay) );
                }
            }

            if (!continueRunning) {
                smoothFollowFocusedAnimation.stop();
                breezyDesktop.smoothFollowFocusedDisplay = null;
            }
        }
    }

    NumberAnimation {
        id: smoothFollowTransitionAnimation
        duration: 150
        property: "smoothFollowTransitionProgress"
        running: false
    }

    Timer {
        interval: 500 // 500ms - 2x per second to avoid running this check too frequently
        repeat: true
        running: true
        onTriggered: {
            updateFocus();
        }
    }

    // release references to displays and stale indexes
    onScreensChanged: {
        breezyDesktop.focusedMonitorIndex = -1;
        zoomOutAnimation.stop();
        zoomInAnimation.stop();
        zoomOnFocusSequence.stop();
        smoothFollowTransitionAnimation.stop();
        smoothFollowFocusedAnimation.stop();

        zoomOutAnimation.target = null;
        zoomInAnimation.target = null;
        zoomOutSeqAnimation.target = null;
        zoomInSeqAnimation.target = null;
        smoothFollowTransitionAnimation.target = null;
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
