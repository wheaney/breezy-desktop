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

    function eusToNwuVector(vector) {
        // Converts EUS vector to NWU vector
        return Qt.vector3d(-vector.z, -vector.x, vector.y);
    }

    function eusToNwuQuat(quaternion) {
        // Converts EUS quaternion to NWU quaternion
        return Qt.quaternion(quaternion.scalar, -quaternion.z, -quaternion.x, quaternion.y);
    }

    // Converts diagonal FOV in radians and aspect ratio to horizontal and vertical FOV measurements
    function diagonalToCrossFOVs(diagonalFOVRadians, aspectRatio) {
        // first convert from a spherical FOV to a diagonal FOV on a flat plane at a unit distance of 1.0
        const diagonalLengthUnitDistance = 2 * Math.tan(diagonalFOVRadians / 2);

        // then convert to flat plane horizontal and vertical FOVs
        const heightUnitDistance = diagonalLengthUnitDistance / Math.sqrt(1 + aspectRatio * aspectRatio);
        const widthUnitDistance = heightUnitDistance * aspectRatio;

        return {
            // then convert back to spherical FOV
            diagonalRadians: diagonalFOVRadians,
            horizontalRadians: 2 * Math.atan(widthUnitDistance / 2),
            verticalRadians: 2 * Math.atan(heightUnitDistance / 2),

            // flat values are relative to a unit distance of 1.0
            diagonalLengthUnitDistance,
            widthUnitDistance,
            heightUnitDistance
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

    function buildFovDetails(screens, viewportWidth, viewportHeight, viewportDiagonalFOV, lensDistanceRatio, defaultDisplayDistance, wrappingChoice, distanceAdjustedSize) {
        console.log(`Breezy - Building FOV details with viewport ${viewportWidth}x${viewportHeight}, diagonal FOV ${viewportDiagonalFOV} degrees, lens distance ratio ${lensDistanceRatio}, default display distance ${defaultDisplayDistance}, wrapping choice ${wrappingChoice}, distance adjusted size ${distanceAdjustedSize}`);
        const aspect = viewportWidth / viewportHeight;
        const fovLengths = diagonalToCrossFOVs(degreeToRadian(viewportDiagonalFOV), aspect);

        let monitorWrappingScheme = actualWrapScheme(screens, viewportWidth, viewportHeight);
        if (wrappingChoice === 1) monitorWrappingScheme = 'horizontal';
        else if (wrappingChoice === 2) monitorWrappingScheme = 'vertical';
        else if (wrappingChoice === 3) monitorWrappingScheme = 'flat';

        const lensDistanceComplement = 1.0 - lensDistanceRatio;
        const lensDistanceFactor = (1.0 / lensDistanceComplement) - 1.0;
        const horizontalConversions = effect.curvedDisplay && monitorWrappingScheme === 'horizontal' ? fovConversionFns.curved : fovConversionFns.flat;
        const verticalConversions = effect.curvedDisplay && monitorWrappingScheme === 'vertical' ? fovConversionFns.curved : fovConversionFns.flat;

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

        // distance needed for the FOV-sized monitor to fill up the screen, as measured from the lenses
        const lensToUnitDistancePixels = viewportWidth / fovLengths.widthUnitDistance;

        // distance from pivot point to lens
        const lensDistancePixels = lensToUnitDistancePixels * lensDistanceFactor;

        // distance from pivot point to full screen (monitor at unit distance from lens)
        const fullScreenDistancePixels = lensToUnitDistancePixels + lensDistancePixels;

        // distance of a display at the default (most zoomed out) distance from the pivot point
        const completeScreenDistancePixels = fullScreenDistancePixels * defaultDisplayDistance;

        const details = {
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

        console.log("Breezy - FOV Details:", details);
        return details;
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
            fovRadiansAtDistance: function(fovRadians, unitLength, newScreenDistance) {
                return 2 * Math.atan(unitLength / 2 / newScreenDistance);
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
            fovRadiansAtDistance: function(fovRadians, unitLength, newScreenDistance) {
                return fovRadians / newScreenDistance;
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
            // monitors wrap around us horizontally

            var sideEdgeRadius = conversionFns.centerToFovEdgeDistance(fovDetails.completeScreenDistancePixels, fovDetails.sizeAdjustedWidthPixels);
            var monitorSpacingPixels = monitorSpacing * fovDetails.sizeAdjustedWidthPixels;

            // targetWidth is assumed to aleady be size adjusted
            var lengthToRadianFn = function(targetWidth) {
                return conversionFns.lengthToRadians(
                    fovDetails.defaultDistanceHorizontalRadians,
                    fovDetails.widthPixels,
                    sideEdgeRadius,
                    targetWidth
                );
            };

            cachedMonitorRadians[0] = -lengthToRadianFn(fovDetails.sizeAdjustedWidthPixels) / 2;
            horizontalMonitorSort(monitorDetailsList).forEach(function(obj) {
                var monitorDetails = obj.monitorDetails;
                var originalIndex = obj.originalIndex;
                var monitorWrapDetails = monitorWrap(cachedMonitorRadians, monitorSpacingPixels, monitorDetails.x, monitorDetails.width, lengthToRadianFn);
                var monitorCenterRadius = conversionFns.fovEdgeToScreenCenterDistance(sideEdgeRadius, monitorDetails.width);
                var upTopPixels = -monitorDetails.y - (monitorDetails.y / fovDetails.sizeAdjustedHeightPixels) * monitorSpacingPixels;
                var upCenterOffsetPixels = (monitorDetails.height - fovDetails.sizeAdjustedHeightPixels) / 2;
                var upCenterPixels = upTopPixels - upCenterOffsetPixels;

                monitorPlacements.push({
                    originalIndex: originalIndex,
                    monitorCenterNorth: monitorCenterRadius,
                    centerNoRotate: Qt.vector3d(
                        monitorCenterRadius,
                        0,
                        upCenterPixels
                    ),
                    centerLook: Qt.vector3d(
                        monitorCenterRadius * Math.cos(monitorWrapDetails.center),
                        -monitorCenterRadius * Math.sin(monitorWrapDetails.center),
                        upCenterPixels
                    ),
                    rotationAngleRadians: {
                        x: 0,
                        y: -monitorWrapDetails.center
                    }
                });
            });
        } else if (fovDetails.monitorWrappingScheme === 'vertical') {
            var topEdgeRadius = conversionFns.centerToFovEdgeDistance(fovDetails.completeScreenDistancePixels, fovDetails.sizeAdjustedHeightPixels);
            var monitorSpacingPixels = monitorSpacing * fovDetails.sizeAdjustedHeightPixels;
            var lengthToRadianFn = function(targetHeight) {
                return conversionFns.lengthToRadians(
                    fovDetails.defaultDistanceVerticalRadians,
                    fovDetails.heightPixels,
                    topEdgeRadius,
                    targetHeight
                );
            };

            cachedMonitorRadians[0] = -lengthToRadianFn(fovDetails.sizeAdjustedHeightPixels) / 2;
            verticalMonitorSort(monitorDetailsList).forEach(function(obj) {
                var monitorDetails = obj.monitorDetails;
                var originalIndex = obj.originalIndex;
                var monitorWrapDetails = monitorWrap(cachedMonitorRadians, monitorSpacingPixels, monitorDetails.y, monitorDetails.height, lengthToRadianFn);
                var monitorCenterRadius = conversionFns.fovEdgeToScreenCenterDistance(topEdgeRadius, monitorDetails.height);
                var westLeftPixels = -monitorDetails.x - (monitorDetails.x / fovDetails.sizeAdjustedWidthPixels) * monitorSpacingPixels;
                var westCenterOffsetPixels = (monitorDetails.width - fovDetails.sizeAdjustedWidthPixels) / 2;
                var westCenterPixels = westLeftPixels - westCenterOffsetPixels;

                monitorPlacements.push({
                    originalIndex: originalIndex,
                    monitorCenterNorth: monitorCenterRadius,
                    centerNoRotate: Qt.vector3d(
                        monitorCenterRadius,
                        westCenterPixels,
                        0
                    ),
                    centerLook: Qt.vector3d(
                        monitorCenterRadius * Math.cos(monitorWrapDetails.center),
                        westCenterPixels,
                        -monitorCenterRadius * Math.sin(monitorWrapDetails.center)
                    ),
                    rotationAngleRadians: {
                        x: -monitorWrapDetails.center,
                        y: 0
                    }
                });
            });
        } else {
            var monitorSpacingPixels = monitorSpacing * fovDetails.sizeAdjustedWidthPixels;
            monitorDetailsList.forEach(function(monitorDetails, index) {
                var upTopPixels = -monitorDetails.y - (monitorDetails.y / fovDetails.sizeAdjustedHeightPixels) * monitorSpacingPixels;
                var westLeftPixels = -monitorDetails.x - (monitorDetails.x / fovDetails.sizeAdjustedWidthPixels) * monitorSpacingPixels;
                var westCenterOffsetPixels = (monitorDetails.width - fovDetails.sizeAdjustedWidthPixels) / 2;
                var upCenterOffsetPixels = (monitorDetails.height - fovDetails.sizeAdjustedHeightPixels) / 2;
                var westCenterPixels = westLeftPixels - westCenterOffsetPixels;
                var upCenterPixels = upTopPixels - upCenterOffsetPixels;

                monitorPlacements.push({
                    originalIndex: index,
                    monitorCenterNorth: fovDetails.completeScreenDistancePixels,
                    centerNoRotate: Qt.vector3d(
                        fovDetails.completeScreenDistancePixels,
                        westCenterPixels,
                        upCenterPixels
                    ),
                    centerLook: Qt.vector3d(
                        fovDetails.completeScreenDistancePixels,
                        westCenterPixels,
                        upCenterPixels
                    ),
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
        // since the monitor vector has been modified to be relative to the lens position, we need to calculate its distance from the lens
        // we need to adjust all angle-based lengths based on new vector distance
        const monitorDistance = monitorVector.length();
        const distanceAdjustment = monitorDistance / fovDetails.completeScreenDistancePixels;

        var vectorUpPixels = upAngleToLength(
            fovDetails.defaultDistanceVerticalRadians,
            fovDetails.heightPixels,
            monitorDistance,
            monitorVector.z,
            monitorVector.x
        ) * distanceAdjustment;
        var upPercentage = Math.abs(lookUpPixels * distanceAdjustment - vectorUpPixels) / monitorDetails.height;

        var vectorWestPixels = westAngleToLength(
            fovDetails.defaultDistanceHorizontalRadians,
            fovDetails.widthPixels,
            monitorDistance,
            monitorVector.y,
            monitorVector.x
        ) * distanceAdjustment;
        var westPercentage = Math.abs(lookWestPixels * distanceAdjustment - vectorWestPixels) / monitorDetails.width;

        // how close we are to any edge is the largest of the two percentages
        return Math.max(upPercentage, westPercentage);
    }

    function findFocusedMonitor(quaternion, position, monitorVectors, currentFocusedIndex, smoothFollowEnabled, fovDetails, monitorsDetails) {
        if (currentFocusedIndex !== -1 && smoothFollowEnabled) return currentFocusedIndex;

        var lookVector = Qt.vector3d(1.0, 0.0, 0.0); // NWU vector pointing to the center of the screen
        var rotatedLookVector = quaternion.times(lookVector);

        // TODO - right now we're using the curved functions to figure out distances even for flat monitors
        // because it will account for the monitors facing towards us, but this will lose some accuracy
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

        function vectorRelativeToPosition(vector) {
            return vector.minus(position);
        }

        // Check current focused monitor first
        if (currentFocusedIndex !== -1) {
            var focusedDistance = getMonitorDistance(
                fovDetails,
                lookUpPixels,
                lookWestPixels,
                vectorRelativeToPosition(monitorVectors[currentFocusedIndex]),
                monitorsDetails[currentFocusedIndex],
                upConversionFns.angleToLength,
                westConversionFns.angleToLength
            ) * effect.focusedDisplayDistance / effect.allDisplaysDistance;

            if (focusedDistance < unfocusThreshold) return currentFocusedIndex;
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
                vectorRelativeToPosition(monitorVectors[i]),
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

    function slerpVector(from, to, progress) {
        const inverseProgress = 1.0 - progress;
        const finalVector = Qt.vector3d(
            from.x * inverseProgress + to.x * progress,
            from.y * inverseProgress + to.y * progress,
            from.z * inverseProgress + to.z * progress
        );

        return finalVector;
    }
}