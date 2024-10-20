function getEpochSec() {
    return toSec(Date.now());
}

function toSec(milliseconds) {
    return Math.floor(milliseconds / 1000);
}

function isValidKeepAlive(dateSec) {
    return Math.abs(toSec(Date.now()) - dateSec) <= 1;
}