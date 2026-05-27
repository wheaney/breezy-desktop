import { applyQuaternionToVector, fovConversionFns, vectorMagnitude } from './math.js';

// if nothing is in focus, take it as soon as it crosses into the monitor's bounds
export const FOCUS_THRESHOLD = 0.95 / 2.0;

// if we leave the monitor with some margin, unfocus even if no other monitor is in focus
export const UNFOCUS_THRESHOLD = 1.1 / 2.0;

/**
 * Given the known radian positions of previously-placed monitors, compute the begin/center/end
 * radian positions for one monitor along a wrapped axis.
 *
 * All vector arguments use plain JS arrays; callers on Qt platforms convert before/after.
 *
 * @param {Object} cachedMonitorRadians - mutable pixel→radian cache shared across all monitors in one axis
 * @param {number} monitorSpacingPixels
 * @param {number} monitorBeginPixel
 * @param {number} monitorLengthPixels
 * @param {function} lengthToRadianFn
 * @returns {{begin: number, center: number, end: number}}
 */
export function monitorWrap(cachedMonitorRadians, monitorSpacingPixels, monitorBeginPixel, monitorLengthPixels, lengthToRadianFn) {
    // Monitor coordinates can become fractional due to size adjustment.
    // If a monitor edge lands extremely close to a cached pixel key, snap to it;
    // otherwise tiny negative gaps can cause us to subtract a full spacing interval.
    let beginPixel = monitorBeginPixel;
    const pixelEpsilon = Math.max(1e-6, Math.abs(monitorLengthPixels) * 1e-6);

    let closestWrapPixel = beginPixel;
    let closestWrap = cachedMonitorRadians[beginPixel];
    if (closestWrap === undefined) {
        closestWrapPixel = Object.keys(cachedMonitorRadians).reduce((previousPixel, currentPixel) => {
            if (previousPixel === undefined) return currentPixel;

            const currentDelta = currentPixel - monitorBeginPixel;
            const previousDelta = previousPixel - monitorBeginPixel;

            // always prefer an exact monitor width match
            if (previousDelta % monitorLengthPixels !== 0) {
                if (currentDelta % monitorLengthPixels === 0) return currentPixel;

                // prefer placing a monitor to the right or below, even if there's a closer placement to the left or above
                if (previousDelta < 0 && currentDelta > 0) return currentPixel;

                // otherwise, just prefer the closest one
                if (Math.abs(currentDelta) < Math.abs(previousDelta)) return currentPixel;
            }

            return previousPixel;
        }, undefined);
        closestWrap = cachedMonitorRadians[closestWrapPixel];
    }

    const closestWrapPixelNumber = Number(closestWrapPixel);
    if (Number.isFinite(closestWrapPixelNumber) && Math.abs(closestWrapPixelNumber - beginPixel) < pixelEpsilon) {
        beginPixel = closestWrapPixelNumber;
        closestWrapPixel = closestWrapPixelNumber;
    }

    const spacingRadians = lengthToRadianFn(monitorSpacingPixels);
    if (closestWrapPixel !== beginPixel) {
        // there's a gap between the cached wrap value and this one
        const gapPixels = beginPixel - closestWrapPixel;
        const gapRadians = lengthToRadianFn(gapPixels);

        // use Math.floor so if it's negative (this monitor is to the left of or above the closest) it will always
        // compensate for the spacing that's needed at the right/bottom
        const appliedSpacingRadians = Math.floor(gapPixels / monitorLengthPixels) * spacingRadians;

        closestWrap = closestWrap + gapRadians + appliedSpacingRadians;
        closestWrapPixel = beginPixel;
        cachedMonitorRadians[closestWrapPixel] = closestWrap;
    }

    const monitorRadians = lengthToRadianFn(monitorLengthPixels);
    const centerRadians = closestWrap + monitorRadians / 2;
    const endRadians = closestWrap + monitorRadians;

    // cache the end position so adjacent monitors can snap to it
    const nextMonitorPixel = beginPixel + monitorLengthPixels;
    if (cachedMonitorRadians[nextMonitorPixel] === undefined)
        cachedMonitorRadians[nextMonitorPixel] = endRadians + spacingRadians;

    return {
        begin: closestWrap,
        center: centerRadians,
        end: endRadians
    }
}

// sort monitors left-to-right, top-to-bottom before placing them to avoid odd gaps
export function horizontalMonitorSort(monitors) {
    return monitors.map((monitor, index) => ({originalIndex: index, monitorDetails: monitor})).sort((a, b) => {
        const aMon = a.monitorDetails;
        const bMon = b.monitorDetails;
        if (aMon.y !== bMon.y) return aMon.y - bMon.y;
        return aMon.x - bMon.x;
    });
}

// sort monitors top-to-bottom, left-to-right before placing them to avoid odd gaps
export function verticalMonitorSort(monitors) {
    return monitors.map((monitor, index) => ({originalIndex: index, monitorDetails: monitor})).sort((a, b) => {
        const aMon = a.monitorDetails;
        const bMon = b.monitorDetails;
        if (aMon.x !== bMon.x) return aMon.x - bMon.x;
        return aMon.y - bMon.y;
    });
}

/**
 * Detect whether a multi-monitor layout is wider or taller relative to the viewport,
 * returning 'horizontal' or 'vertical'. Used when wrappingScheme is 'automatic'.
 *
 * @param {Object[]} monitors - [{x, y, width, height}]
 * @param {number} viewportWidth
 * @param {number} viewportHeight
 * @returns {'horizontal'|'vertical'}
 */
export function autoDetectWrapScheme(monitors, viewportWidth, viewportHeight) {
    const minX = Math.min(...monitors.map(m => m.x));
    const maxX = Math.max(...monitors.map(m => m.x + m.width));
    const minY = Math.min(...monitors.map(m => m.y));
    const maxY = Math.max(...monitors.map(m => m.y + m.height));
    return (maxX - minX) / viewportWidth >= (maxY - minY) / viewportHeight ? 'horizontal' : 'vertical';
}

/**
 * Returns how far the look vector is from the center of a monitor, as a percentage of
 * the monitor's dimensions (0 = center, 0.5 = exactly at edge, >0.5 = outside).
 *
 * All vector arguments are plain arrays in NWU order: [north, west, up].
 *
 * @param {Object} fovDetails
 * @param {number} lookUpPixels
 * @param {number} lookWestPixels
 * @param {number[]} monitorVector - [north, west, up] center of the monitor relative to lens
 * @param {{width: number, height: number}} monitorDetails
 * @param {function} upAngleToLength
 * @param {function} westAngleToLength
 * @returns {number}
 */
export function getMonitorDistance(fovDetails, lookUpPixels, lookWestPixels, monitorVector, monitorDetails, upAngleToLength, westAngleToLength) {
    const monitorDistance = vectorMagnitude(monitorVector);
    const distanceAdjustment = monitorDistance / fovDetails.completeScreenDistancePixels;

    // monitorVector[0]=north, monitorVector[1]=west, monitorVector[2]=up
    const vectorUpPixels = upAngleToLength(
        fovDetails.defaultDistanceVerticalRadians,
        fovDetails.heightPixels,
        monitorDistance,
        monitorVector[2],
        monitorVector[0]
    ) * distanceAdjustment;
    const upPercentage = Math.abs(lookUpPixels * distanceAdjustment - vectorUpPixels) / monitorDetails.height;

    const vectorWestPixels = westAngleToLength(
        fovDetails.defaultDistanceHorizontalRadians,
        fovDetails.widthPixels,
        monitorDistance,
        monitorVector[1],
        monitorVector[0]
    ) * distanceAdjustment;
    const westPercentage = Math.abs(lookWestPixels * distanceAdjustment - vectorWestPixels) / monitorDetails.width;

    return Math.max(upPercentage, westPercentage);
}

/**
 * Find which monitor the user is looking at.
 *
 * All vectors use plain NWU arrays: [north, west, up].
 * Quaternion is [x, y, z, w].
 *
 * @param {number[]} quaternion - current head orientation [x, y, z, w]
 * @param {number[]} position - lens position [north, west, up] in pixel units
 * @param {number[][]} monitorVectors - centerLook for each monitor
 * @param {number} currentFocusedIndex
 * @param {number} focusedMonitorDistance - display_distance / display_distance_default, < 1 when zoomed in
 * @param {boolean} smoothFollowEnabled
 * @param {Object} fovDetails
 * @param {Object[]} monitorsDetails - [{x, y, width, height}]
 * @returns {number} index of focused monitor, or -1 if none
 */
export function findFocusedMonitor(quaternion, position, monitorVectors, currentFocusedIndex, focusedMonitorDistance, smoothFollowEnabled, fovDetails, monitorsDetails) {
    if (currentFocusedIndex !== -1 && smoothFollowEnabled) return currentFocusedIndex;

    const lookVector = [1.0, 0.0, 0.0]; // NWU vector pointing to the center of the screen
    const rotatedLookVector = applyQuaternionToVector(lookVector, quaternion);

    // TODO - right now we're using the curved functions to figure out distances even for flat monitors
    // because it will account for the monitors facing towards us, but this will lose some accuracy
    const upConversionFns = fovDetails.monitorWrappingScheme === 'vertical' ? fovConversionFns.curved : fovConversionFns.flat;
    const lookUpPixels = upConversionFns.angleToLength(
        fovDetails.defaultDistanceVerticalRadians,
        fovDetails.heightPixels,
        fovDetails.completeScreenDistancePixels,
        rotatedLookVector[2],
        rotatedLookVector[0]
    );
    const westConversionFns = fovDetails.monitorWrappingScheme === 'horizontal' ? fovConversionFns.curved : fovConversionFns.flat;
    const lookWestPixels = westConversionFns.angleToLength(
        fovDetails.defaultDistanceHorizontalRadians,
        fovDetails.widthPixels,
        fovDetails.completeScreenDistancePixels,
        rotatedLookVector[1],
        rotatedLookVector[0]
    );

    function vectorRelativeToLensPosition(vector) {
        return [
            vector[0] - position[0],
            vector[1] - position[1],
            vector[2] - position[2]
        ];
    }

    // the currently focused monitor is the most likely to be the closest, check it first and exit early if it is
    if (currentFocusedIndex !== -1) {
        const focusedDistance = getMonitorDistance(
            fovDetails,
            lookUpPixels,
            lookWestPixels,
            vectorRelativeToLensPosition(monitorVectors[currentFocusedIndex]),
            monitorsDetails[currentFocusedIndex],
            upConversionFns.angleToLength,
            westConversionFns.angleToLength
        ) * focusedMonitorDistance;

        if (focusedDistance < UNFOCUS_THRESHOLD) return currentFocusedIndex;
    }

    let closestIndex = -1;
    let closestDistance = Infinity;

    monitorVectors.forEach((monitorVector, index) => {
        if (index === currentFocusedIndex) return;

        const distance = getMonitorDistance(
            fovDetails,
            lookUpPixels,
            lookWestPixels,
            vectorRelativeToLensPosition(monitorVector),
            monitorsDetails[index],
            upConversionFns.angleToLength,
            westConversionFns.angleToLength
        );

        if (distance < closestDistance) {
            closestIndex = index;
            closestDistance = distance;
        }
    });

    if (smoothFollowEnabled || closestDistance < FOCUS_THRESHOLD) return closestIndex;

    return -1;
}

/**
 * Convert monitor layout details into NWU placement vectors for rendering.
 *
 * Vectors in the returned objects are plain arrays [north, west, up].
 * Qt callers should wrap centerNoRotate/centerLook with Qt.vector3d after calling.
 *
 * @param {Object} fovDetails - widthPixels, heightPixels, sizeAdjustedWidthPixels, sizeAdjustedHeightPixels,
 *                              defaultDistanceHorizontalRadians, defaultDistanceVerticalRadians,
 *                              completeScreenDistancePixels, monitorWrappingScheme, curvedDisplay
 * @param {Object[]} monitorDetailsList - [{x, y, width, height}] in size-adjusted viewport-relative coords
 * @param {number} monitorSpacing - visual spacing as a fraction of viewport width (e.g. 0.02)
 * @returns {Object[]} - [{originalIndex, monitorCenterNorth, centerNoRotate, centerLook, rotationAngleRadians}]
 */
export function monitorsToPlacements(fovDetails, monitorDetailsList, monitorSpacing) {
    const monitorPlacements = [];
    const cachedMonitorRadians = {};

    const conversionFns = fovDetails.curvedDisplay ? fovConversionFns.curved : fovConversionFns.flat;

    if (fovDetails.monitorWrappingScheme === 'horizontal') {
        const sideEdgeRadius = conversionFns.centerToFovEdgeDistance(fovDetails.completeScreenDistancePixels, fovDetails.sizeAdjustedWidthPixels);
        const monitorSpacingPixels = monitorSpacing * fovDetails.sizeAdjustedWidthPixels;

        const lengthToRadianFn = (targetWidth) => conversionFns.lengthToRadians(
            fovDetails.defaultDistanceHorizontalRadians,
            fovDetails.widthPixels,
            sideEdgeRadius,
            targetWidth
        );

        cachedMonitorRadians[0] = -lengthToRadianFn(fovDetails.sizeAdjustedWidthPixels) / 2;
        horizontalMonitorSort(monitorDetailsList).forEach(({monitorDetails, originalIndex}) => {
            const monitorWrapDetails = monitorWrap(cachedMonitorRadians, monitorSpacingPixels, monitorDetails.x, monitorDetails.width, lengthToRadianFn);
            const monitorCenterRadius = conversionFns.fovEdgeToScreenCenterDistance(sideEdgeRadius, monitorDetails.width);
            const upTopPixels = -monitorDetails.y - (monitorDetails.y / fovDetails.sizeAdjustedHeightPixels) * monitorSpacingPixels;
            const upCenterOffsetPixels = (monitorDetails.height - fovDetails.sizeAdjustedHeightPixels) / 2;
            const upCenterPixels = upTopPixels - upCenterOffsetPixels;

            monitorPlacements.push({
                originalIndex,
                monitorCenterNorth: monitorCenterRadius,
                centerNoRotate: [monitorCenterRadius, 0, upCenterPixels],
                centerLook: [
                    monitorCenterRadius * Math.cos(monitorWrapDetails.center),
                    -monitorCenterRadius * Math.sin(monitorWrapDetails.center),
                    upCenterPixels
                ],
                rotationAngleRadians: { x: 0, y: -monitorWrapDetails.center }
            });
        });
    } else if (fovDetails.monitorWrappingScheme === 'vertical') {
        const topEdgeRadius = conversionFns.centerToFovEdgeDistance(fovDetails.completeScreenDistancePixels, fovDetails.sizeAdjustedHeightPixels);
        const monitorSpacingPixels = monitorSpacing * fovDetails.sizeAdjustedHeightPixels;

        const lengthToRadianFn = (targetHeight) => conversionFns.lengthToRadians(
            fovDetails.defaultDistanceVerticalRadians,
            fovDetails.heightPixels,
            topEdgeRadius,
            targetHeight
        );

        cachedMonitorRadians[0] = -lengthToRadianFn(fovDetails.sizeAdjustedHeightPixels) / 2;
        verticalMonitorSort(monitorDetailsList).forEach(({monitorDetails, originalIndex}) => {
            const monitorWrapDetails = monitorWrap(cachedMonitorRadians, monitorSpacingPixels, monitorDetails.y, monitorDetails.height, lengthToRadianFn);
            const monitorCenterRadius = conversionFns.fovEdgeToScreenCenterDistance(topEdgeRadius, monitorDetails.height);
            const westLeftPixels = -monitorDetails.x - (monitorDetails.x / fovDetails.sizeAdjustedWidthPixels) * monitorSpacingPixels;
            const westCenterOffsetPixels = (monitorDetails.width - fovDetails.sizeAdjustedWidthPixels) / 2;
            const westCenterPixels = westLeftPixels - westCenterOffsetPixels;

            monitorPlacements.push({
                originalIndex,
                monitorCenterNorth: monitorCenterRadius,
                centerNoRotate: [monitorCenterRadius, westCenterPixels, 0],
                centerLook: [
                    monitorCenterRadius * Math.cos(monitorWrapDetails.center),
                    westCenterPixels,
                    -monitorCenterRadius * Math.sin(monitorWrapDetails.center)
                ],
                rotationAngleRadians: { x: -monitorWrapDetails.center, y: 0 }
            });
        });
    } else {
        const monitorSpacingPixels = monitorSpacing * fovDetails.sizeAdjustedWidthPixels;

        monitorDetailsList.forEach((monitorDetails, index) => {
            const upTopPixels = -monitorDetails.y - (monitorDetails.y / fovDetails.sizeAdjustedHeightPixels) * monitorSpacingPixels;
            const westLeftPixels = -monitorDetails.x - (monitorDetails.x / fovDetails.sizeAdjustedWidthPixels) * monitorSpacingPixels;
            const westCenterOffsetPixels = (monitorDetails.width - fovDetails.sizeAdjustedWidthPixels) / 2;
            const upCenterOffsetPixels = (monitorDetails.height - fovDetails.sizeAdjustedHeightPixels) / 2;
            const westCenterPixels = westLeftPixels - westCenterOffsetPixels;
            const upCenterPixels = upTopPixels - upCenterOffsetPixels;

            monitorPlacements.push({
                originalIndex: index,
                monitorCenterNorth: fovDetails.completeScreenDistancePixels,
                centerNoRotate: [fovDetails.completeScreenDistancePixels, westCenterPixels, upCenterPixels],
                centerLook: [fovDetails.completeScreenDistancePixels, westCenterPixels, upCenterPixels],
                rotationAngleRadians: { x: 0, y: 0 }
            });
        });
    }

    monitorPlacements.sort((a, b) => a.originalIndex - b.originalIndex);

    return monitorPlacements;
}
