import QtQuick
import "./shared/math.js" as SharedMath
import "./shared/displayPlacement.js" as SharedPlacement

QtObject {
    readonly property real focusThreshold: SharedPlacement.FOCUS_THRESHOLD
    readonly property real unfocusThreshold: SharedPlacement.UNFOCUS_THRESHOLD

    // --- Qt coordinate-space helpers (not in shared because they use Qt types) ---

    function radianToDegree(radian) {
        return radian * 180 / Math.PI;
    }

    function nwuToEusVector(vector) {
        return Qt.vector3d(-vector.y, vector.z, -vector.x);
    }

    function eusToNwuVector(vector) {
        return Qt.vector3d(-vector.z, -vector.x, vector.y);
    }

    function eusToNwuQuat(quaternion) {
        return Qt.quaternion(quaternion.scalar, -quaternion.z, -quaternion.x, quaternion.y);
    }

    function slerpVector(from, to, progress) {
        const inverseProgress = 1.0 - progress;
        return Qt.vector3d(
            from.x * inverseProgress + to.x * progress,
            from.y * inverseProgress + to.y * progress,
            from.z * inverseProgress + to.z * progress
        );
    }

    // --- Delegated to shared (re-exported for callers that go through this object) ---

    function degreeToRadian(degree) { return SharedMath.degreeToRadian(degree); }
    function diagonalToCrossFOVs(diagonalFOVRadians, aspectRatio) { return SharedMath.diagonalToCrossFOVs(diagonalFOVRadians, aspectRatio); }

    readonly property var fovConversionFns: SharedMath.fovConversionFns

    function monitorWrap(cachedMonitorRadians, monitorSpacingPixels, monitorBeginPixel, monitorLengthPixels, lengthToRadianFn) {
        return SharedPlacement.monitorWrap(cachedMonitorRadians, monitorSpacingPixels, monitorBeginPixel, monitorLengthPixels, lengthToRadianFn);
    }

    // --- FOV / wrap-scheme helpers ---

    function actualWrapScheme(screens, viewportWidth, viewportHeight) {
        const monitors = screens.map(screen => ({
            x: screen.geometry.x, y: screen.geometry.y,
            width: screen.geometry.width, height: screen.geometry.height
        }));
        return SharedPlacement.autoDetectWrapScheme(monitors, viewportWidth, viewportHeight);
    }

    function buildFovDetails(screens, viewportWidth, viewportHeight, viewportDiagonalFOV, lensDistanceRatio, defaultDisplayDistance, wrappingChoice, distanceAdjustedSize) {
        const aspect = viewportWidth / viewportHeight;
        const fovLengths = SharedMath.diagonalToCrossFOVs(SharedMath.degreeToRadian(viewportDiagonalFOV), aspect);

        let monitorWrappingScheme = actualWrapScheme(screens, viewportWidth, viewportHeight);
        if (wrappingChoice === 1) monitorWrappingScheme = 'horizontal';
        else if (wrappingChoice === 2) monitorWrappingScheme = 'vertical';
        else if (wrappingChoice === 3) monitorWrappingScheme = 'flat';

        const lensDistanceComplement = 1.0 - lensDistanceRatio;
        const lensDistanceFactor = (1.0 / lensDistanceComplement) - 1.0;
        const horizontalConversions = effect.curvedDisplay && monitorWrappingScheme === 'horizontal' ? SharedMath.fovConversionFns.curved : SharedMath.fovConversionFns.flat;
        const verticalConversions = effect.curvedDisplay && monitorWrappingScheme === 'vertical' ? SharedMath.fovConversionFns.curved : SharedMath.fovConversionFns.flat;

        const defaultDistanceVerticalRadians = verticalConversions.fovRadiansAtDistance(
            fovLengths.verticalRadians,
            fovLengths.heightUnitDistance,
            defaultDisplayDistance
        );
        const defaultDistanceHorizontalRadians = horizontalConversions.fovRadiansAtDistance(
            fovLengths.horizontalRadians,
            fovLengths.widthUnitDistance,
            defaultDisplayDistance
        );

        const lensToUnitDistancePixels = viewportWidth / fovLengths.widthUnitDistance;
        const lensDistancePixels = lensToUnitDistancePixels * lensDistanceFactor;
        const fullScreenDistancePixels = lensToUnitDistancePixels + lensDistancePixels;
        const completeScreenDistancePixels = fullScreenDistancePixels * defaultDisplayDistance;

        return {
            widthPixels: viewportWidth,
            distanceAdjustedSize,
            sizeAdjustedWidthPixels: viewportWidth * distanceAdjustedSize,
            heightPixels: viewportHeight,
            sizeAdjustedHeightPixels: viewportHeight * distanceAdjustedSize,
            defaultDistanceVerticalRadians,
            defaultDistanceHorizontalRadians,
            lensDistancePixels,
            fullScreenDistancePixels,
            completeScreenDistancePixels,
            monitorWrappingScheme,
            curvedDisplay: effect.curvedDisplay
        };
    }

    // Wraps SharedPlacement.monitorsToPlacements, converting plain-array vectors to Qt.vector3d.
    function monitorsToPlacements(fovDetails, monitorDetailsList, monitorSpacing) {
        return SharedPlacement.monitorsToPlacements(fovDetails, monitorDetailsList, monitorSpacing)
            .map(p => ({
                originalIndex: p.originalIndex,
                monitorCenterNorth: p.monitorCenterNorth,
                centerNoRotate: Qt.vector3d(p.centerNoRotate[0], p.centerNoRotate[1], p.centerNoRotate[2]),
                centerLook:     Qt.vector3d(p.centerLook[0],     p.centerLook[1],     p.centerLook[2]),
                rotationAngleRadians: p.rotationAngleRadians
            }));
    }

    // Wraps SharedPlacement.findFocusedMonitor, adapting Qt types to plain arrays.
    function findFocusedMonitor(quaternion, position, monitorVectors, currentFocusedIndex, smoothFollowEnabled, fovDetails, monitorsDetails) {
        // convert Qt.quaternion [scalar, x, y, z] → shared [x, y, z, w]
        const quatArray = [quaternion.x, quaternion.y, quaternion.z, quaternion.scalar];

        // convert Qt.vector3d position → plain array
        const posArray = [position.x, position.y, position.z];

        // convert Qt.vector3d monitor centerLook vectors → plain arrays
        const vectorArrays = monitorVectors.map(v => [v.x, v.y, v.z]);

        // adapt monitorsDetails from screen.geometry shape to plain {x,y,width,height}
        const detailsArrays = monitorsDetails.map(d => ({
            x: d.x, y: d.y, width: d.width, height: d.height
        }));

        // KWin passes focusedDisplayDistance / allDisplaysDistance inline; use 1.0 as neutral default
        // and rely on the caller to scale if needed (matches legacy behaviour where ratio wasn't passed)
        return SharedPlacement.findFocusedMonitor(
            quatArray, posArray, vectorArrays,
            currentFocusedIndex,
            effect.focusedDisplayDistance / effect.allDisplaysDistance,
            smoothFollowEnabled,
            fovDetails,
            detailsArrays
        );
    }
}
