function getEpochSec() {
    return toSec(Date.now());
}

function toSec(milliseconds) {
    return Math.floor(milliseconds / 1000);
}

function isValidKeepAlive(dateSec, strictCheck = false) {
    return Math.abs(toSec(Date.now()) - dateSec) <= (strictCheck ? 1 : 5);
}