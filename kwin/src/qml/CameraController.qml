import QtQuick
import QtQuick3D

Item {
    id: cameraController

    required property Camera camera
    required property var fovDetails

    Displays {
        id: displays
    }

    property real aspectRatio: effect.displayResolution[0] / effect.displayResolution[1]
    property real lensDistanceRatio: effect.lensDistanceRatio
    property bool sbsEnabled: effect.sbsEnabled
    property bool customBannerEnabled: effect.customBannerEnabled
    property bool smoothFollowEnabled: effect.smoothFollowEnabled
    property real lookAheadScanlineMs: effect.lookAheadConfig[2]
    property var crossFovs: displays.diagonalToCrossFOVs(
        displays.degreeToRadian(effect.diagonalFOV),
        aspectRatio
    );

    // if true, then smoothFollowEnabled just cleared and the orientation data is slerping back, 
    // continue to use the origin data for the duration of the Timer
    property bool smoothFollowDisabling: false

    property real clipNear: 10.0
    property real clipFar: 10000.0

    function ratesOfChange(orientations) {
        const e0 = orientations[0].toEulerAngles();
        const e1 = orientations[1].toEulerAngles();
        const dt = effect.poseTimeElapsedMs;
        const yawDegrees = (e0.y - e1.y) / dt;
        const pitchDegrees = (e0.x - e1.x) / dt;
        const rollDegrees = (e0.z - e1.z) / dt;

        return {
            eulerEnd: e0,
            eulerStart: e1,
            yawDegrees: yawDegrees,
            yaw: displays.degreeToRadian(yawDegrees),
            pitchDegrees: pitchDegrees,
            pitch: displays.degreeToRadian(pitchDegrees),
            rollDegrees: rollDegrees,
            roll: displays.degreeToRadian(rollDegrees)
        };
    }

    function updateCamera(orientations, position, rates) {
        camera.eulerRotation = applyLookAhead(
            rates,
            lookAheadMS(
                effect.poseTimestamp,
                effect.lookAheadConfig,
                effect.lookAheadOverride
            )
        );
        camera.position = position.times(fovDetails.completeScreenDistancePixels).plus(orientations[0].times(Qt.vector3d(0, 0, -fovDetails.lensDistancePixels)));
    }

    // how far to look ahead is how old the pose data is plus a constant that is either the default for this device or an override
    function lookAheadMS(poseDateMs, lookAheadConfig, override) {
        // how stale the pose data is
        const dataAge = Date.now() - poseDateMs;

        const lookAheadConstant = lookAheadConfig[0];
        const lookAheadMultiplier = lookAheadConfig[1];
        return (override === -1 ? lookAheadConstant : override) + dataAge;
    }

    function applyLookAhead(rates, lookAheadMs) {
        return Qt.vector3d(
            rates.eulerEnd.x + rates.pitchDegrees * lookAheadMs,
            rates.eulerEnd.y + rates.yawDegrees * lookAheadMs,
            rates.eulerEnd.z + rates.rollDegrees * lookAheadMs,
        );
    }

    function updateProjection() {
        camera.projection = buildPerspectiveMatrix();
    }

    function buildPerspectiveMatrix() {
        const f = 1.0 / crossFovs.verticalTangent;
        const nf = 1.0 / (clipNear - clipFar);
        const m00 = f / aspectRatio;
        const m11 = f;
        const m22 = (clipFar + clipNear) * nf;
        const m23 = (2.0 * clipFar * clipNear) * nf;

        // Standard OpenGL-style projection matrix
        return Qt.matrix4x4(
            m00, 0,   0,   0,
            0,   m11, 0,   0,
            0,   0,   m22, m23,
            0,   0,  -1,   0
        );
    }

    function applyRollingShutterShear(rates) {
        // Convert to maximum shift at bottom of frame
        const maxDxNdc = (rates.yaw * lookAheadScanlineMs) / crossFovs.horizontalTangent;
        const maxDyNdc = -(rates.pitch * lookAheadScanlineMs) / crossFovs.verticalTangent;

        let shx = maxDxNdc / 2.0;
        let shy = maxDyNdc / 2.0;

        const f = 1.0 / crossFovs.verticalTangent;
        const nf = 1.0 / (clipNear - clipFar);
        const m00 = f / aspectRatio;
        const m11 = f;
        const m22 = (clipFar + clipNear) * nf;
        const m23 = (2.0 * clipFar * clipNear) * nf;

        const r0c0 = m00;
        const r0c1 = -(shx * m11) / 2.0;
        const r0c2 = -(shx) / 2.0;
        const r0c3 = 0.0;

        const r1c0 = 0.0;
        const r1c1 = m11 * (1.0 - shy / 2.0);
        const r1c2 = -(shy) / 2.0;
        const r1c3 = 0.0;

        const r2c0 = 0.0;
        const r2c1 = 0.0;
        const r2c2 = m22;
        const r2c3 = m23;

        const r3c0 = 0.0;
        const r3c1 = 0.0;
        const r3c2 = -1.0;
        const r3c3 = 0.0;

        camera.projection = Qt.matrix4x4(
            r0c0, r0c1, r0c2, r0c3,
            r1c0, r1c1, r1c2, r1c3,
            r2c0, r2c1, r2c2, r2c3,
            r3c0, r3c1, r3c2, r3c3
        );
    }

    Component.onCompleted: updateProjection();

    FrameAnimation {
        running: true
        onTriggered: {
            const orientations = (effect.smoothFollowEnabled || smoothFollowDisabling) ? effect.smoothFollowOrigin : effect.poseOrientations;
            if (orientations && orientations.length > 0) {
                const rates = ratesOfChange(orientations);
                updateCamera(orientations, effect.posePosition, rates);
                applyRollingShutterShear(rates);
            }
        }
    }

    Timer {
        id: smoothFollowDisablingTimer
        interval: 750
        repeat: false
        onTriggered: {
            cameraController.smoothFollowDisabling = false;
        }
    }

    onSmoothFollowEnabledChanged: {
        smoothFollowDisablingTimer.stop();
        smoothFollowDisabling = !smoothFollowEnabled;
        if (smoothFollowDisabling) smoothFollowDisablingTimer.start();
    }
}
