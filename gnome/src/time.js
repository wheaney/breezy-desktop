export function getEpochSec() {
    return toSec(Date.now());
}

export function toSec(milliseconds) {
    return Math.floor(milliseconds / 1000);
}

export function isValidKeepAlive(dateSec) {
    return Math.abs(toSec(Date.now()) - dateSec) <= 1;
}