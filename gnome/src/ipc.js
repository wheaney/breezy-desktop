export const UINT8_SIZE = 1;
export const BOOL_SIZE = UINT8_SIZE;
export const UINT_SIZE = 4;
export const FLOAT_SIZE = 4;

export const DATA_VIEW_INFO_OFFSET_INDEX = 0;
export const DATA_VIEW_INFO_SIZE_INDEX = 1;
export const DATA_VIEW_INFO_COUNT_INDEX = 2;

// computes the end offset, exclusive
export function dataViewEnd(dataViewInfo) {
    return dataViewInfo[DATA_VIEW_INFO_OFFSET_INDEX] + dataViewInfo[DATA_VIEW_INFO_SIZE_INDEX] * dataViewInfo[DATA_VIEW_INFO_COUNT_INDEX];
}

export function dataViewUint8(dataView, dataViewInfo) {
    return dataView.getUint8(dataViewInfo[DATA_VIEW_INFO_OFFSET_INDEX]);
}

export function dataViewUint(dataView, dataViewInfo) {
    return dataView.getUint32(dataViewInfo[DATA_VIEW_INFO_OFFSET_INDEX], true);
}

export function dataViewBigUint(dataView, dataViewInfo) {
    return Number(dataView.getBigUint64(dataViewInfo[DATA_VIEW_INFO_OFFSET_INDEX], true));
}

export function dataViewUint32Array(dataView, dataViewInfo) {
    const uintArray = []
    let offset = dataViewInfo[DATA_VIEW_INFO_OFFSET_INDEX];
    for (let i = 0; i < dataViewInfo[DATA_VIEW_INFO_COUNT_INDEX]; i++) {
        uintArray.push(dataView.getUint32(offset, true));
        offset += UINT_SIZE;
    }
    return uintArray;
}

export function dataViewUint8Array(dataView, dataViewInfo) {
    const uintArray = []
    let offset = dataViewInfo[DATA_VIEW_INFO_OFFSET_INDEX];
    for (let i = 0; i < dataViewInfo[DATA_VIEW_INFO_SIZE_INDEX] * dataViewInfo[DATA_VIEW_INFO_COUNT_INDEX]; i++) {
        uintArray.push(dataView.getUint8(offset));
        offset += UINT8_SIZE;
    }
    return uintArray;
}

export function dataViewFloat(dataView, dataViewInfo) {
    return dataView.getFloat32(dataViewInfo[DATA_VIEW_INFO_OFFSET_INDEX], true);
}

export function dataViewFloatArray(dataView, dataViewInfo) {
    const floatArray = []
    let offset = dataViewInfo[DATA_VIEW_INFO_OFFSET_INDEX];
    for (let i = 0; i < dataViewInfo[DATA_VIEW_INFO_COUNT_INDEX]; i++) {
        floatArray.push(dataView.getFloat32(offset, true));
        offset += FLOAT_SIZE;
    }
    return floatArray;
}