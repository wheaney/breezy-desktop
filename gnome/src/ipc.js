var UINT8_SIZE = 1;
var BOOL_SIZE = UINT8_SIZE;
var UINT_SIZE = 4;
var FLOAT_SIZE = 4;

var DATA_VIEW_INFO_OFFSET_INDEX = 0;
var DATA_VIEW_INFO_SIZE_INDEX = 1;
var DATA_VIEW_INFO_COUNT_INDEX = 2;

// computes the end offset, exclusive
function dataViewEnd(dataViewInfo) {
    return dataViewInfo[DATA_VIEW_INFO_OFFSET_INDEX] + dataViewInfo[DATA_VIEW_INFO_SIZE_INDEX] * dataViewInfo[DATA_VIEW_INFO_COUNT_INDEX];
}

function dataViewUint8(dataView, dataViewInfo) {
    return dataView.getUint8(dataViewInfo[DATA_VIEW_INFO_OFFSET_INDEX]);
}

function dataViewUint(dataView, dataViewInfo) {
    return dataView.getUint32(dataViewInfo[DATA_VIEW_INFO_OFFSET_INDEX], true);
}

function dataViewBigUint(dataView, dataViewInfo) {
    return Number(dataView.getBigUint64(dataViewInfo[DATA_VIEW_INFO_OFFSET_INDEX], true));
}

function dataViewUint32Array(dataView, dataViewInfo) {
    const uintArray = []
    let offset = dataViewInfo[DATA_VIEW_INFO_OFFSET_INDEX];
    for (let i = 0; i < dataViewInfo[DATA_VIEW_INFO_COUNT_INDEX]; i++) {
        uintArray.push(dataView.getUint32(offset, true));
        offset += UINT_SIZE;
    }
    return uintArray;
}

function dataViewUint8Array(dataView, dataViewInfo) {
    const uintArray = []
    let offset = dataViewInfo[DATA_VIEW_INFO_OFFSET_INDEX];
    for (let i = 0; i < dataViewInfo[DATA_VIEW_INFO_SIZE_INDEX] * dataViewInfo[DATA_VIEW_INFO_COUNT_INDEX]; i++) {
        uintArray.push(dataView.getUint8(offset));
        offset += UINT8_SIZE;
    }
    return uintArray;
}

function dataViewFloat(dataView, dataViewInfo) {
    return dataView.getFloat32(dataViewInfo[DATA_VIEW_INFO_OFFSET_INDEX], true);
}

function dataViewFloatArray(dataView, dataViewInfo) {
    const floatArray = []
    let offset = dataViewInfo[DATA_VIEW_INFO_OFFSET_INDEX];
    for (let i = 0; i < dataViewInfo[DATA_VIEW_INFO_COUNT_INDEX]; i++) {
        floatArray.push(dataView.getFloat32(offset, true));
        offset += FLOAT_SIZE;
    }
    return floatArray;
}