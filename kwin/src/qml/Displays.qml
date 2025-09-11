import QtQuick

QtObject {
    readonly property real focusThreshold: 0.95 / 2.0
    readonly property real unfocusThreshold: 1.1 / 2.0

    // Converts degrees to radians
    function degreeToRadian(degree) {
        return degree * Math.PI / 180;
    }

    function radianToDegree(radian) {
        return radian * 180 / Math.PI;
    }

    function nwuToEusVector(vector) {
        // Converts NWU vector to EUS vector
        return Qt.vector3d(-vector.y, vector.z, -vector.x);
    }

    function eusToNwuQuat(quaternion) {
        // Converts EUS quaternion to NWU quaternion
        return Qt.quaternion(quaternion.scalar, -quaternion.z, -quaternion.x, quaternion.y);
    }

    // Converts diagonal FOV in radians and aspect ratio to horizontal and vertical FOVs
    function diagonalToCrossFOVs(diagonalFOVRadians, aspectRatio) {
        var flatDiagonalFOV = 2 * Math.tan(diagonalFOVRadians / 2);
        var flatVerticalFOV = flatDiagonalFOV / Math.sqrt(1 + aspectRatio * aspectRatio);
        var flatHorizontalFOV = flatVerticalFOV * aspectRatio;
        return {
            diagonal: diagonalFOVRadians,
            horizontal: 2 * Math.atan(flatHorizontalFOV / 2),
            vertical: 2 * Math.atan(flatVerticalFOV / 2)
        }
    }

    function actualWrapScheme(screens, viewportWidth, viewportHeight) {
        const minX = Math.min(...screens.map(screen => screen.geometry.x));
        const maxX = Math.max(...screens.map(screen => screen.geometry.x + screen.geometry.width));
        const minY = Math.min(...screens.map(screen => screen.geometry.y));
        const maxY = Math.max(...screens.map(screen => screen.geometry.y + screen.geometry.height));

        if ((maxX - minX) / viewportWidth >= (maxY - minY) / viewportHeight) {
            return 'horizontal';
        } else {
            return 'vertical';
        }
    }

    function fovDetails(screens, viewportWidth, viewportHeight, viewportDiagonalFOV, lensDistanceRatio, defaultDisplayDistance, wrappingChoice) {
        const aspect = viewportWidth / viewportHeight;
        const fovRadians = diagonalToCrossFOVs(degreeToRadian(viewportDiagonalFOV), aspect);
        const defaultDistanceVerticalRadians = 2 * Math.atan(Math.tan(fovRadians.vertical / 2) / defaultDisplayDistance);
        const defaultDistanceHorizontalRadians = 2 * Math.atan(Math.tan(fovRadians.horizontal / 2) / defaultDisplayDistance);

        // distance needed for the FOV-sized monitor to fill up the screen
        const fullScreenDistance = viewportHeight / 2 / Math.tan(fovRadians.vertical / 2);
        const lensDistancePixels = fullScreenDistance / (1.0 - lensDistanceRatio) - fullScreenDistance;

        // distance of a display at the default (most zoomed out) distance, plus the lens distance constant
        const lensToScreenDistance = viewportHeight / 2 / Math.tan(defaultDistanceVerticalRadians / 2);
        const completeScreenDistancePixels = lensToScreenDistance + lensDistancePixels;

        let monitorWrappingScheme = actualWrapScheme(screens, viewportWidth, viewportHeight);
        if (wrappingChoice === 1) monitorWrappingScheme = 'horizontal';
        else if (wrappingChoice === 2) monitorWrappingScheme = 'vertical';
        else if (wrappingChoice === 3) monitorWrappingScheme = 'flat';

        return {
            widthPixels: viewportWidth,
            heightPixels: viewportHeight,
            defaultDistanceVerticalRadians,
            defaultDistanceHorizontalRadians,
            lensDistancePixels,
            completeScreenDistancePixels,
            monitorWrappingScheme: monitorWrappingScheme,
            curvedDisplay: false // or true
        };
    }

    // Utility constant
    readonly property real segmentsPerRadian: 20.0 / degreeToRadian(90.0)

    // FOV conversion functions for flat and curved displays
    property var fovConversionFns: ({
        flat: {
            centerToFovEdgeDistance: function(centerDistance, fovLength) {
                return Math.sqrt(Math.pow(fovLength / 2, 2) + Math.pow(centerDistance, 2));
            },
            fovEdgeToScreenCenterDistance: function(edgeDistance, screenLength) {
                return Math.sqrt(Math.pow(edgeDistance, 2) - Math.pow(screenLength / 2, 2));
            },
            lengthToRadians: function(fovRadians, fovLength, screenEdgeDistance, toLength) {
                return Math.asin(toLength / 2 / screenEdgeDistance) * 2;
            },
            angleToLength: function(fovRadians, fovLength, screenDistance, toAngleOpposite, toAngleAdjacent) {
                return toAngleOpposite / toAngleAdjacent * screenDistance;
            },
            radiansToSegments: function(screenRadians) { return 1; }
        },
        curved: {
            centerToFovEdgeDistance: function(centerDistance, fovLength) {
                return centerDistance;
            },
            fovEdgeToScreenCenterDistance: function(edgeDistance, screenLength) {
                return edgeDistance;
            },
            lengthToRadians: function(fovRadians, fovLength, screenEdgeDistance, toLength) {
                return fovRadians / fovLength * toLength;
            },
            angleToLength: function(fovRadians, fovLength, screenDistance, toAngleOpposite, toAngleAdjacent) {
                return fovLength / fovRadians * Math.atan2(toAngleOpposite, toAngleAdjacent);
            },
            radiansToSegments: function(screenRadians) {
                return Math.ceil(screenRadians * segmentsPerRadian);
            }
        }
    })

    function monitorWrap(cachedMonitorRadians, monitorSpacingPixels, monitorBeginPixel, monitorLengthPixels, lengthToRadianFn) {
        var closestWrapPixel = monitorBeginPixel;
        var closestWrap = cachedMonitorRadians[monitorBeginPixel];
        if (closestWrap === undefined) {
            var keys = Object.keys(cachedMonitorRadians);
            closestWrapPixel = keys.reduce(function(previousPixel, currentPixel) {
                if (previousPixel === undefined) return currentPixel;

                var currentDelta = currentPixel - monitorBeginPixel;
                var previousDelta = previousPixel - monitorBeginPixel;

                if (previousDelta % monitorLengthPixels !== 0) {
                    if (currentDelta % monitorLengthPixels === 0) return currentPixel;
                    if (previousDelta < 0 && currentDelta > 0) return currentPixel;
                    if (Math.abs(currentDelta) < Math.abs(previousDelta)) return currentPixel;
                }
                return previousPixel;
            }, undefined);
            closestWrap = cachedMonitorRadians[closestWrapPixel];
        }

        var spacingRadians = lengthToRadianFn(monitorSpacingPixels);
        if (closestWrapPixel !== monitorBeginPixel) {
            var gapPixels = monitorBeginPixel - closestWrapPixel;
            var gapRadians = lengthToRadianFn(gapPixels);
            var appliedSpacingRadians = Math.floor(gapPixels / monitorLengthPixels) * spacingRadians;
            closestWrap = closestWrap + gapRadians + appliedSpacingRadians;
            closestWrapPixel = monitorBeginPixel;
            cachedMonitorRadians[closestWrapPixel] = closestWrap;
        }

        var monitorRadians = lengthToRadianFn(monitorLengthPixels);
        var centerRadians = closestWrap + monitorRadians / 2;
        var endRadians = closestWrap + monitorRadians;

        var nextMonitorPixel = monitorBeginPixel + monitorLengthPixels;
        if (cachedMonitorRadians[nextMonitorPixel] === undefined)
            cachedMonitorRadians[nextMonitorPixel] = endRadians + spacingRadians;

        return {
            begin: closestWrap,
            center: centerRadians,
            end: endRadians
        }
    }

    function horizontalMonitorSort(monitors) {
        return monitors.map(function(monitor, index) {
            return { originalIndex: index, monitorDetails: monitor };
        }).sort(function(a, b) {
            var aMon = a.monitorDetails;
            var bMon = b.monitorDetails;
            if (aMon.y !== bMon.y) return aMon.y - bMon.y;
            return aMon.x - bMon.x;
        });
    }

    function verticalMonitorSort(monitors) {
        return monitors.map(function(monitor, index) {
            return { originalIndex: index, monitorDetails: monitor };
        }).sort(function(a, b) {
            var aMon = a.monitorDetails;
            var bMon = b.monitorDetails;
            if (aMon.x !== bMon.x) return aMon.x - bMon.x;
            return aMon.y - bMon.y;
        });
    }

    // fovDetails: { widthPixels, heightPixels, defaultDistanceHorizontalRadians, defaultDistanceVerticalRadians, completeScreenDistancePixels, monitorWrappingScheme, curvedDisplay }
    // monitorDetailsList: [{x, y, width, height}, ...]
    // monitorSpacing: number (percentage, e.g. 0.05 for 5%)
    function monitorsToPlacements(fovDetails, monitorDetailsList, monitorSpacing) {
        var monitorPlacements = [];
        var cachedMonitorRadians = {};

        var conversionFns = fovDetails.curvedDisplay ? fovConversionFns.curved : fovConversionFns.flat;

        if (fovDetails.monitorWrappingScheme === 'horizontal') {
            var sideEdgeRadius = conversionFns.centerToFovEdgeDistance(fovDetails.completeScreenDistancePixels, fovDetails.widthPixels);
            var monitorSpacingPixels = monitorSpacing * fovDetails.widthPixels;
            var lengthToRadianFn = function(targetWidth) {
                return conversionFns.lengthToRadians(
                    fovDetails.defaultDistanceHorizontalRadians,
                    fovDetails.widthPixels,
                    sideEdgeRadius,
                    targetWidth
                );
            };

            cachedMonitorRadians[0] = -fovDetails.defaultDistanceHorizontalRadians / 2;
            horizontalMonitorSort(monitorDetailsList).forEach(function(obj) {
                var monitorDetails = obj.monitorDetails;
                var originalIndex = obj.originalIndex;
                var monitorWrapDetails = monitorWrap(cachedMonitorRadians, monitorSpacingPixels, monitorDetails.x, monitorDetails.width, lengthToRadianFn);
                var monitorCenterRadius = conversionFns.fovEdgeToScreenCenterDistance(sideEdgeRadius, monitorDetails.width);
                var upTopPixels = -monitorDetails.y - (monitorDetails.y / fovDetails.heightPixels) * monitorSpacingPixels;
                var upCenterOffsetPixels = (monitorDetails.height - fovDetails.heightPixels) / 2;
                var upCenterPixels = upTopPixels - upCenterOffsetPixels;

                monitorPlacements.push({
                    originalIndex: originalIndex,
                    centerNoRotate: Qt.vector3d(
                        monitorCenterRadius,
                        0,
                        upCenterPixels
                    ),
                    centerLook: Qt.vector3d(
                        monitorCenterRadius * Math.cos(monitorWrapDetails.center),
                        -monitorCenterRadius * Math.sin(monitorWrapDetails.center),
                        upCenterPixels
                    ).normalized(),
                    rotationAngleRadians: {
                        x: 0,
                        y: -monitorWrapDetails.center
                    }
                });
            });
        } else if (fovDetails.monitorWrappingScheme === 'vertical') {
            var topEdgeRadius = conversionFns.centerToFovEdgeDistance(fovDetails.completeScreenDistancePixels, fovDetails.heightPixels);
            var monitorSpacingPixels = monitorSpacing * fovDetails.heightPixels;
            var lengthToRadianFn = function(targetHeight) {
                return conversionFns.lengthToRadians(
                    fovDetails.defaultDistanceVerticalRadians,
                    fovDetails.heightPixels,
                    topEdgeRadius,
                    targetHeight
                );
            };

            cachedMonitorRadians[0] = -fovDetails.defaultDistanceVerticalRadians / 2;
            verticalMonitorSort(monitorDetailsList).forEach(function(obj) {
                var monitorDetails = obj.monitorDetails;
                var originalIndex = obj.originalIndex;
                var monitorWrapDetails = monitorWrap(cachedMonitorRadians, monitorSpacingPixels, monitorDetails.y, monitorDetails.height, lengthToRadianFn);
                var monitorCenterRadius = conversionFns.fovEdgeToScreenCenterDistance(topEdgeRadius, monitorDetails.height);
                var westLeftPixels = -monitorDetails.x - (monitorDetails.x / fovDetails.widthPixels) * monitorSpacingPixels;
                var westCenterOffsetPixels = (monitorDetails.width - fovDetails.widthPixels) / 2;
                var westCenterPixels = westLeftPixels - westCenterOffsetPixels;

                monitorPlacements.push({
                    originalIndex: originalIndex,
                    centerNoRotate: Qt.vector3d(
                        monitorCenterRadius,
                        westCenterPixels,
                        0
                    ),
                    centerLook: Qt.vector3d(
                        monitorCenterRadius * Math.cos(monitorWrapDetails.center),
                        westCenterPixels,
                        -monitorCenterRadius * Math.sin(monitorWrapDetails.center)
                    ).normalized(),
                    rotationAngleRadians: {
                        x: -monitorWrapDetails.center,
                        y: 0
                    }
                });
            });
        } else {
            var monitorSpacingPixels = monitorSpacing * fovDetails.widthPixels;
            monitorDetailsList.forEach(function(monitorDetails, index) {
                var upTopPixels = -monitorDetails.y - (monitorDetails.y / fovDetails.heightPixels) * monitorSpacingPixels;
                var westLeftPixels = -monitorDetails.x - (monitorDetails.x / fovDetails.widthPixels) * monitorSpacingPixels;
                var westCenterOffsetPixels = (monitorDetails.width - fovDetails.widthPixels) / 2;
                var upCenterOffsetPixels = (monitorDetails.height - fovDetails.heightPixels) / 2;
                var westCenterPixels = westLeftPixels - westCenterOffsetPixels;
                var upCenterPixels = upTopPixels - upCenterOffsetPixels;

                monitorPlacements.push({
                    originalIndex: index,
                    centerNoRotate: Qt.vector3d(
                        fovDetails.completeScreenDistancePixels,
                        westCenterPixels,
                        upCenterPixels
                    ),
                    centerLook: Qt.vector3d(
                        fovDetails.completeScreenDistancePixels,
                        westCenterPixels,
                        upCenterPixels
                    ).normalized(),
                    rotationAngleRadians: {
                        x: 0,
                        y: 0
                    }
                });
            });
        }

        // put them back in the original monitor order before returning
        monitorPlacements.sort(function(a, b) { return a.originalIndex - b.originalIndex; });
        
        return monitorPlacements;
    }

    // returns how far the look vector is from the center of the monitor, as a percentage of the monitor's dimensions
    function getMonitorDistance(fovDetails, lookUpPixels, lookWestPixels, monitorVector, monitorDetails, upAngleToLength, westAngleToLength) {
        var vectorUpPixels = upAngleToLength(
            fovDetails.defaultDistanceVerticalRadians,
            fovDetails.heightPixels,
            fovDetails.completeScreenDistancePixels,
            monitorVector.z,
            monitorVector.x
        );
        var upPercentage = Math.abs(lookUpPixels - vectorUpPixels) / monitorDetails.height;

        var vectorWestPixels = westAngleToLength(
            fovDetails.defaultDistanceHorizontalRadians,
            fovDetails.widthPixels,
            fovDetails.completeScreenDistancePixels,
            monitorVector.y,
            monitorVector.x
        );
        var westPercentage = Math.abs(lookWestPixels - vectorWestPixels) / monitorDetails.width;

        // how close we are to any edge is the largest of the two percentages
        return Math.max(upPercentage, westPercentage);
    }

    function findFocusedMonitor(quaternion, monitorVectors, currentFocusedIndex, smoothFollowEnabled, fovDetails, monitorsDetails) {
        var lookVector = Qt.vector3d(1.0, 0.0, 0.0); // NWU vector pointing to the center of the screen
        var rotatedLookVector = quaternion.times(lookVector);

        // Use curved or flat conversion functions depending on wrapping scheme
        var upConversionFns = fovDetails.monitorWrappingScheme === "vertical" ? fovConversionFns.curved : fovConversionFns.flat;
        var lookUpPixels = upConversionFns.angleToLength(
            fovDetails.defaultDistanceVerticalRadians,
            fovDetails.heightPixels,
            fovDetails.completeScreenDistancePixels,
            rotatedLookVector.z,
            rotatedLookVector.x
        );
        var westConversionFns = fovDetails.monitorWrappingScheme === "horizontal" ? fovConversionFns.curved : fovConversionFns.flat;
        var lookWestPixels = westConversionFns.angleToLength(
            fovDetails.defaultDistanceHorizontalRadians,
            fovDetails.widthPixels,
            fovDetails.completeScreenDistancePixels,
            rotatedLookVector.y,
            rotatedLookVector.x
        );

        // Check current focused monitor first
        if (currentFocusedIndex !== -1) {
            var focusedDistance = getMonitorDistance(
                fovDetails,
                lookUpPixels,
                lookWestPixels,
                monitorVectors[currentFocusedIndex],
                monitorsDetails[currentFocusedIndex],
                upConversionFns.angleToLength,
                westConversionFns.angleToLength
            ) * effect.focusedDisplayDistance / effect.allDisplaysDistance;

            if (smoothFollowEnabled || focusedDistance < unfocusThreshold)
                return currentFocusedIndex;
        }

        var closestIndex = -1;
        var closestDistance = Number.POSITIVE_INFINITY;

        // Find the closest monitor
        for (var i = 0; i < monitorVectors.length; ++i) {
            if (i === currentFocusedIndex)
                continue;
            var distance = getMonitorDistance(
                fovDetails,
                lookUpPixels,
                lookWestPixels,
                monitorVectors[i],
                monitorsDetails[i],
                upConversionFns.angleToLength,
                westConversionFns.angleToLength
            );

            if (distance < closestDistance) {
                closestIndex = i;
                closestDistance = distance;
            }
        }

        if (smoothFollowEnabled || closestDistance < focusThreshold)
            return closestIndex;

        // Unfocus all displays
        return -1;
    }
}