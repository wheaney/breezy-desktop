import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import Globals from './globals.js';
import { 
    dataViewEnd,
    dataViewUint8,
    dataViewBigUint,
    dataViewUint32Array,
    dataViewUint8Array,
    dataViewFloat,
    dataViewFloatArray,
    BOOL_SIZE,
    FLOAT_SIZE,
    UINT_SIZE,
    UINT8_SIZE
} from "./ipc.js";
import { isValidKeepAlive, getEpochSec, toSec } from "./time.js";

const IPC_FILE_PATH = "/dev/shm/breezy_desktop_imu";
const KEEPALIVE_REFRESH_INTERVAL_SEC = 1;

// the driver should be using the same data layout version
const DATA_LAYOUT_VERSION = 3;

// DataView info: [offset, size, count]
const VERSION = [0, UINT8_SIZE, 1];
const ENABLED = [dataViewEnd(VERSION), BOOL_SIZE, 1];
const LOOK_AHEAD_CFG = [dataViewEnd(ENABLED), FLOAT_SIZE, 4];
const DISPLAY_RES = [dataViewEnd(LOOK_AHEAD_CFG), UINT_SIZE, 2];
const DISPLAY_FOV = [dataViewEnd(DISPLAY_RES), FLOAT_SIZE, 1];
const LENS_DISTANCE_RATIO = [dataViewEnd(DISPLAY_FOV), FLOAT_SIZE, 1];
const SBS_ENABLED = [dataViewEnd(LENS_DISTANCE_RATIO), BOOL_SIZE, 1];
const CUSTOM_BANNER_ENABLED = [dataViewEnd(SBS_ENABLED), BOOL_SIZE, 1];
const EPOCH_MS = [dataViewEnd(CUSTOM_BANNER_ENABLED), UINT_SIZE, 2];
const IMU_QUAT_DATA = [dataViewEnd(EPOCH_MS), FLOAT_SIZE, 16];
const IMU_PARITY_BYTE = [dataViewEnd(IMU_QUAT_DATA), UINT8_SIZE, 1];
const DATA_VIEW_LENGTH = dataViewEnd(IMU_PARITY_BYTE);

function checkParityByte(dataView) {
    const parityByte = dataViewUint8(dataView, IMU_PARITY_BYTE);
    let parity = 0;
    const epochUint8 = dataViewUint8Array(dataView, EPOCH_MS);
    const imuDataUint8 = dataViewUint8Array(dataView, IMU_QUAT_DATA);
    for (let i = 0; i < epochUint8.length; i++) {
        parity ^= epochUint8[i];
    }
    for (let i = 0; i < imuDataUint8.length; i++) {
        parity ^= imuDataUint8[i];
    }
    return parityByte === parity;
}

const COUNTER_MAX = 150;
function nextDebugIMUQuaternion(counter) {
    const angle = counter / COUNTER_MAX * 2 * Math.PI;
    const yaw = 10 * Math.PI / 180 * Math.cos(angle);
    const roll = 0;
    const pitch = 10 * Math.PI / 180 * Math.sin(angle);

    const cy = Math.cos(yaw * 0.5);
    const sy = Math.sin(yaw * 0.5);
    const cp = Math.cos(pitch * 0.5);
    const sp = Math.sin(pitch * 0.5);
    const cr = Math.cos(roll * 0.5);
    const sr = Math.sin(roll * 0.5);

    const w = cr * cp * cy + sr * sp * sy;
    const x = sr * cp * cy - cr * sp * sy;
    const y = cr * sp * cy + sr * cp * sy;
    const z = cr * cp * sy - sr * sp * cy;

    return [x, y, z, w];
}

export const DeviceDataStream = GObject.registerClass({
    Properties: {
        'breezy-desktop-running': GObject.ParamSpec.boolean(
            'breezy-desktop-running',
            'Breezy Desktop running',
            'Whether Breezy Desktop mode is enabled in xr_driver and supported glasses are connected',
            GObject.ParamFlags.READWRITE,
            false
        ),
        'widescreen-mode-state': GObject.ParamSpec.boolean(
            'widescreen-mode-state',
            'Widescreen mode state',
            'The state of widescreen mode from the perspective of the driver',
            GObject.ParamFlags.READWRITE,
            false
        ),
        'imu-snapshots': GObject.ParamSpec.jsobject(
            'imu-snapshots',
            'IMU Snapshots',
            'Latest IMU quaternion snapshots and epoch timestamp for when it was collected',
            GObject.ParamFlags.READWRITE
        ),
        'debug-no-device': GObject.ParamSpec.boolean(
            'debug-no-device',
            'Debug without device',
            'Debug mode that allows for testing with moving IMU values without a device connected',
            GObject.ParamFlags.READWRITE,
            false
        )
    }
}, class DeviceDataStream extends GObject.Object {
    constructor(params = {}) {
        super(params);
        this.breezy_desktop_running = false;
        this._ipc_file = Gio.file_new_for_path(IPC_FILE_PATH);
        this._running = false;
        this.device_data = null;
    }

    start() {
        this._running = true;
        this._poll();
    }

    stop() {
        this._running = false;
        this.device_data = null;
    }

    // polling is just intended to keep breezy_desktop_running current, anything needing up-to-date imu data should 
    // trigger a refresh with the default flag
    _poll() {
        if (this._running) {
            this.refresh_data(true);
            setTimeout(this._poll.bind(this), 1000);
        }
    }

    // Refresh the data from the IPC file. if keepalive_only is true, we'll only check and update breezy_desktop_running if it 
    // hasn't been checked within KEEPALIVE_REFRESH_INTERVAL_SEC.
    refresh_data(keepalive_only = false) {
        if (!this.debug_no_device && this.was_debug_no_device) {
            this.was_debug_no_device = false;
            this.device_data = null;
            this.breezy_desktop_running = false;
            this.imu_snapshots = null;
        }

        if (this._ipc_file.query_exists(null) && (
            !this.device_data?.imuData || 
            !keepalive_only || 
            getEpochSec() - toSec(this.device_data?.imuDateMs ?? 0) > KEEPALIVE_REFRESH_INTERVAL_SEC
        )) {
            let data = this._ipc_file.load_contents(null);
            if (data[0]) {
                let buffer = new Uint8Array(data[1]).buffer;
                let dataView = new DataView(buffer);
                if (dataView.byteLength === DATA_VIEW_LENGTH) {
                    let imuDateMs = dataViewBigUint(dataView, EPOCH_MS);
                    const validKeepalive = isValidKeepAlive(toSec(imuDateMs));
                    let imuData = dataViewFloatArray(dataView, IMU_QUAT_DATA);
                    const imuResetState = validKeepalive && imuData[0] === 0.0 && imuData[1] === 0.0 && imuData[2] === 0.0 && imuData[3] === 1.0;
                    const version = dataViewUint8(dataView, VERSION);
                    const enabled = dataViewUint8(dataView, ENABLED) !== 0 && version === DATA_LAYOUT_VERSION && validKeepalive;
                    const sbsEnabled = dataViewUint8(dataView, SBS_ENABLED) !== 0;

                    // update the widescreen property if the state changes while still enabled, trigger "notify::" events
                    if (enabled && this.widescreen_mode_state !== sbsEnabled) this.widescreen_mode_state = sbsEnabled;

                    if (!this.device_data) {
                        this.device_data = {
                            version,
                            enabled,
                            imuResetState,
                            displayRes: dataViewUint32Array(dataView, DISPLAY_RES),
                            sbsEnabled,
                            displayFov: 44.0, // dataViewFloat(dataView, DISPLAY_FOV),
                            lookAheadCfg: dataViewFloatArray(dataView, LOOK_AHEAD_CFG),
                        };
                    } else if (keepalive_only) {
                        this.device_data = {
                            ...this.device_data,
                            imuResetState,
                            enabled,
                            sbsEnabled
                        }
                    }

                    let success = keepalive_only;
                    let attempts = 0;
                    while (!success && attempts < 3) {
                        if (dataView.byteLength === DATA_VIEW_LENGTH) {
                            if (checkParityByte(dataView)) {
                                this.device_data.imuData = imuData;
                                this.device_data.imuDateMs = imuDateMs;
                                this.imu_snapshots = {
                                    imu_data: imuData,
                                    timestamp_ms: imuDateMs
                                };
                                success = true;
                            }
                        } else if (dataView.byteLength !== 0) {
                            Globals.logger.log(`[ERROR] Invalid dataView.byteLength: ${dataView.byteLength} !== ${DATA_VIEW_LENGTH}`)
                        }
        
                        if (!success && ++attempts < 3) {
                            data = this._ipc_file.load_contents(null);
                            if (data[0]) {
                                buffer = new Uint8Array(data[1]).buffer;
                                dataView = new DataView(buffer);
                                imuDateMs = dataViewBigUint(dataView, EPOCH_MS);
                                imuData = dataViewFloatArray(dataView, IMU_QUAT_DATA);
                            }
                        }
                    }

                    if (success) {
                        // update the supported device connected property if the state changes, trigger "notify::" events
                        const breezy_desktop_running = enabled && validKeepalive;
                        if (this.breezy_desktop_running !== breezy_desktop_running) this.breezy_desktop_running = breezy_desktop_running;
                    }
                }
            } else {
                this.breezy_desktop_running = false;
            }
        } else if (this.debug_no_device) {
            this.was_debug_no_device = true;
            if (!this.device_data) {
                this.device_data = {
                    version: 1.0,
                    enabled: true,
                    imuResetState: false,
                    displayRes: [1920.0, 1080.0],
                    sbsEnabled: false,
                    displayFov: 46.0,
                    lookAheadCfg: [0.0, 0.0, 0.0, 0.0]
                }
            }

            if (!keepalive_only) {
                this._counter = ((this._counter ?? -1)+1)%COUNTER_MAX;

                const imuDataFirst = nextDebugIMUQuaternion(this._counter);
                const imuData = [
                    ...imuDataFirst,
                    ...imuDataFirst,
                    ...imuDataFirst,
                    2.0, 1.0, 0.0, 0.0
                ]
                const imuDateMs = Date.now();
                this.device_data.imuData = imuData;
                this.device_data.imuDateMs = imuDateMs;
                this.imu_snapshots = {
                    imu_data: imuData,
                    timestamp_ms: imuDateMs
                };
            }
            this.breezy_desktop_running = true;
            return;
        }
    }
});