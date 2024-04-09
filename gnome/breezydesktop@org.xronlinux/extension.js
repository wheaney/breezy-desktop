import Clutter from 'gi://Clutter'
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import { CursorManager } from './cursormanager.js';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const UINT8_SIZE = 1;
const BOOL_SIZE = UINT8_SIZE;
const UINT_SIZE = 4;
const FLOAT_SIZE = 4;

const DATA_VIEW_INFO_OFFSET_INDEX = 0;
const DATA_VIEW_INFO_SIZE_INDEX = 1;
const DATA_VIEW_INFO_COUNT_INDEX = 2;

// computes the end offset, exclusive
function dataViewEnd(dataViewInfo) {
    return dataViewInfo[DATA_VIEW_INFO_OFFSET_INDEX] + dataViewInfo[DATA_VIEW_INFO_SIZE_INDEX] * dataViewInfo[DATA_VIEW_INFO_COUNT_INDEX];
}

// the driver should be using the same data layout version
const DATA_LAYOUT_VERSION = 1;

// DataView info: [offset, size, count]
const VERSION = [0, UINT8_SIZE, 1];
const ENABLED = [dataViewEnd(VERSION), BOOL_SIZE, 1];
const EPOCH_SEC = [dataViewEnd(ENABLED), UINT_SIZE, 1];
const LOOK_AHEAD_CFG = [dataViewEnd(EPOCH_SEC), FLOAT_SIZE, 4];
const DISPLAY_RES = [dataViewEnd(LOOK_AHEAD_CFG), UINT_SIZE, 2];
const DISPLAY_FOV = [dataViewEnd(DISPLAY_RES), FLOAT_SIZE, 1];
const DISPLAY_ZOOM = [dataViewEnd(DISPLAY_FOV), FLOAT_SIZE, 1];
const DISPLAY_NORTH_OFFSET = [dataViewEnd(DISPLAY_ZOOM), FLOAT_SIZE, 1];
const LENS_DISTANCE_RATIO = [dataViewEnd(DISPLAY_NORTH_OFFSET), FLOAT_SIZE, 1];
const SBS_ENABLED = [dataViewEnd(LENS_DISTANCE_RATIO), BOOL_SIZE, 1];
const SBS_CONTENT = [dataViewEnd(SBS_ENABLED), BOOL_SIZE, 1];
const SBS_MODE_STRETCHED = [dataViewEnd(SBS_CONTENT), BOOL_SIZE, 1];
const CUSTOM_BANNER_ENABLED = [dataViewEnd(SBS_MODE_STRETCHED), BOOL_SIZE, 1];
const IMU_QUAT_DATA = [dataViewEnd(CUSTOM_BANNER_ENABLED), FLOAT_SIZE, 16];
const DATA_VIEW_LENGTH = dataViewEnd(IMU_QUAT_DATA);

// cached after first retrieval
const shaderUniformLocations = {
    'enabled': null,
    'show_banner': null,
    'imu_quat_data': null,
    'look_ahead_cfg': null,
    'stage_aspect_ratio': null,
    'display_aspect_ratio': null,
    'trim_width_percent': null,
    'trim_height_percent': null,
    'display_zoom': null,
    'display_north_offset': null,
    'lens_distance_ratio': null,
    'sbs_enabled': null,
    'sbs_content': null,
    'sbs_mode_stretched': null,
    'custom_banner_enabled': null,
    'half_fov_z_rads': null,
    'half_fov_y_rads': null,
    'screen_distance': null,
    'frametime': null
};

function dataViewUint8(dataView, dataViewInfo) {
    return dataView.getUint8(dataViewInfo[DATA_VIEW_INFO_OFFSET_INDEX]);
}

function dataViewUint(dataView, dataViewInfo) {
    return dataView.getUint32(dataViewInfo[DATA_VIEW_INFO_OFFSET_INDEX], true);
}

function dataViewUintArray(dataView, dataViewInfo) {
    const uintArray = []
    let offset = dataViewInfo[DATA_VIEW_INFO_OFFSET_INDEX];
    for (let i = 0; i < dataViewInfo[DATA_VIEW_INFO_COUNT_INDEX]; i++) {
        uintArray.push(dataView.getUint32(offset, true));
        offset += UINT_SIZE;
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


function getShaderSource(path) {
    const file = Gio.file_new_for_path(path);
    const data = file.load_contents(null);

    // version string helps with linting, but GNOME extension doesn't like it, so remove it if it's there
    //
    // TODO -   Gjs on GNOME 45.5 WARNING: Some code called array.toString() on a Uint8Array instance. Previously this 
    //          would have interpreted the bytes of the array as a string, but that is nonstandard. In the future this 
    //          will return the bytes as comma-separated digits. For the time being, the old behavior has been preserved, 
    //          but please fix your code anyway to use TextDecoder.
    return data[1].toString().replace(/^#version .*$/gm, '') + '\n';
}

function transferUniformBoolean(effect, locationName, dataView, dataViewInfo) {
    // GLSL bool is a float under the hood, evaluates false if 0 or 0.0, true otherwise
    effect.set_uniform_float(locationName, 1, [dataViewUint8(dataView, dataViewInfo)]);
}

function setUniformFloat(effect, locationName, dataViewInfo, value) {
    effect.set_uniform_float(shaderUniformLocations[locationName], dataViewInfo[DATA_VIEW_INFO_COUNT_INDEX], value);
}

function transferUniformFloat(effect, locationName, dataView, dataViewInfo) {
    setUniformFloat(effect, locationName, dataViewInfo, dataViewFloatArray(dataView, dataViewInfo));
}

function setSingleFloat(effect, locationName, value) {
    effect.set_uniform_float(shaderUniformLocations[locationName], 1, [value]);
}

function setUniformMatrix(effect, locationName, components, dataView, dataViewInfo) {
    const numValues = dataViewInfo[DATA_VIEW_INFO_COUNT_INDEX];
    if (numValues / components !== components) {
        throw new Error('Invalid matrix size');
    }

    const floatArray = [].fill(0, 0, numValues);
    let offset = dataViewInfo[DATA_VIEW_INFO_OFFSET_INDEX];
    for (let i = 0; i < numValues; i++) {
        // GLSL uses column-major order, so we need to transpose the matrix
        const row = i % components;
        const column = Math.floor(i / components);

        floatArray[row * components + column] = dataView.getFloat32(offset, true);
        offset += FLOAT_SIZE;
    }
    effect.set_uniform_matrix(shaderUniformLocations[locationName], true, components, floatArray);
}

function getEpochSec() {
    return Math.floor(Date.now() / 1000);
}

function degreeToRadian(degree) {
    return degree * Math.PI / 180;
}


// most uniforms don't change frequently, this function should be called periodically
function setIntermittentUniformVariables() {
    const dataView = this._dataView;

    if (dataView.byteLength === DATA_VIEW_LENGTH) {
        const version = dataViewUint8(dataView, VERSION);
        const date = dataViewUint(dataView, EPOCH_SEC);
        const validKeepalive = Math.abs(getEpochSec() - date) < 5;
        const imuData = dataViewFloatArray(dataView, IMU_QUAT_DATA);
        const imuResetState = imuData[0] === 0.0 && imuData[1] === 0.0 && imuData[2] === 0.0 && imuData[3] === 1.0;
        const enabled = dataViewUint8(dataView, ENABLED) !== 0 && version === DATA_LAYOUT_VERSION && validKeepalive && !imuResetState;

        if (enabled) {
            const displayRes = dataViewUintArray(dataView, DISPLAY_RES);
            const displayFov = dataViewFloat(dataView, DISPLAY_FOV);
            const lensDistanceRatio = dataViewFloat(dataView, LENS_DISTANCE_RATIO);

            // compute these values once, they only change when the XR device changes
            const displayAspectRatio = displayRes[0] / displayRes[1];
            const stageAspectRatio = this._targetMonitor.width / this._targetMonitor.height;
            const diagToVertRatio = Math.sqrt(Math.pow(stageAspectRatio, 2) + 1);
            const halfFovZRads = degreeToRadian(displayFov / diagToVertRatio) / 2;
            const halfFovYRads = halfFovZRads * stageAspectRatio;
            const screenDistance = 1.0 - lensDistanceRatio;

            // our overlay doesn't quite cover the full screen texture, which allows us to see some of the real desktop
            // underneath, so we trim two pixels around the entire edge of the texture
            const trimWidthPercent = 2.0 / this._targetMonitor.width;
            const trimHeightPercent = 2.0 / this._targetMonitor.height;
            
            // all these values are transferred directly, unmodified from the driver
            transferUniformFloat(this, 'look_ahead_cfg', dataView, LOOK_AHEAD_CFG);
            transferUniformFloat(this, 'display_zoom', dataView, DISPLAY_ZOOM);
            transferUniformFloat(this, 'display_north_offset', dataView, DISPLAY_NORTH_OFFSET);
            transferUniformFloat(this, 'lens_distance_ratio', dataView, LENS_DISTANCE_RATIO);
            transferUniformBoolean(this, 'sbs_enabled', dataView, SBS_ENABLED);
            transferUniformBoolean(this, 'sbs_content', dataView, SBS_CONTENT);
            transferUniformBoolean(this, 'sbs_mode_stretched', dataView, SBS_MODE_STRETCHED);
            transferUniformBoolean(this, 'custom_banner_enabled', dataView, CUSTOM_BANNER_ENABLED);

            // computed values with no dataViewInfo, so we set these manually
            setSingleFloat(this, 'show_banner', imuResetState);
            setSingleFloat(this, 'stage_aspect_ratio', stageAspectRatio);
            setSingleFloat(this, 'display_aspect_ratio', displayAspectRatio);
            setSingleFloat(this, 'trim_width_percent', trimWidthPercent);
            setSingleFloat(this, 'trim_height_percent', trimHeightPercent);
            setSingleFloat(this, 'half_fov_z_rads', halfFovZRads);
            setSingleFloat(this, 'half_fov_y_rads', halfFovYRads);
            setSingleFloat(this, 'screen_distance', screenDistance);
            setSingleFloat(this, 'frametime', this._frametime);
        }
        setSingleFloat(this, 'enabled', enabled ? 1.0 : 0.0);
    } else if (dataView.byteLength !== 0) {
        console.error(`Invalid dataView.byteLength: ${dataView.byteLength} !== ${DATA_VIEW_LENGTH}`)
    }
}


export default class BreezyDesktopExtension extends Extension {
    constructor(metadata, uuid) {
        super(metadata, uuid);
        this._extensionPath = metadata.path;
        
        // Set/destroyed by enable/disable
        this._cursorManager = null;
        this._shared_mem_file = null;
        this._xr_effect = null;
        this._overlay = null;
    }

    enable() {
        if (!this._check_driver_running()) {
            this._running_poller_id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, (() => {
                if (this._check_driver_running()) {
                    this._effect_enable();
                    this._running_poller_id = undefined;
                    return GLib.SOURCE_REMOVE;
                } else {
                    return GLib.SOURCE_CONTINUE;
                }
            }).bind(this));
        } else {
            this._effect_enable();
        }
    }

    _check_driver_running() {
        if (!this._shared_mem_file) this._shared_mem_file = Gio.file_new_for_path("/dev/shm/imu_data");
        return this._shared_mem_file.query_exists(null);
    }

    _effect_enable() {
        if (!this._cursorManager) this._cursorManager = new CursorManager(Main.layoutManager.uiGroup);
        this._cursorManager.enable();

        if (!this._overlay) {
            const monitors = Main.layoutManager.monitors;
            this._targetMonitor = monitors[monitors.length-1];

            this._overlay = new St.Bin({ style: 'background-color: rgba(0, 0, 0, 1);'});
            this._overlay.opacity = 255;
            this._overlay.set_position(this._targetMonitor.x, this._targetMonitor.y);
            this._overlay.set_size(this._targetMonitor.width, this._targetMonitor.height);

            const overlayContent = new Clutter.Actor({clip_to_allocation: true});
            const uiClone = new Clutter.Clone({ source: Main.layoutManager.uiGroup, clip_to_allocation: true });
            overlayContent.add_actor(uiClone);

            this._overlay.set_child(overlayContent);

            global.stage.insert_child_above(this._overlay, null);
            Shell.util_set_hidden_from_pick(this._overlay, true);

            uiClone.x = -this._targetMonitor.x;
            uiClone.y = -this._targetMonitor.y;
        }

        if (!this._xr_effect) {
            const extensionPath = this._extensionPath;
            const shared_mem_file = this._shared_mem_file;
            const targetMonitor = this._targetMonitor;
            var XREffect = GObject.registerClass({}, class XREffect extends Shell.GLSLEffect {
                vfunc_build_pipeline() {
                    const code = getShaderSource(`${extensionPath}/IMUAdjust.frag`);
                    const main = 'PS_IMU_Transform(vec4(0, 0, 0, 0), cogl_tex_coord_in[0].xy, cogl_color_out);';
                    this.add_glsl_snippet(Shell.SnippetHook.FRAGMENT, code, main, false);

                    this._frametime = Math.floor(1000 / 90); // 90 FPS
                    this._targetMonitor = targetMonitor;
                }

                vfunc_paint_target(node, paintContext) {
                    var now = Date.now();
                    var lastPaint = this._last_paint || 0;
                    var frametime = this._frametime;
                    const data = shared_mem_file.load_contents(null);
                    if (data[0]) {
                        const buffer = new Uint8Array(data[1]).buffer;
                        this._dataView = new DataView(buffer);
                        if (!this._initialized) {
                            this.set_uniform_float(this.get_uniform_location('uDesktopTexture'), 1, [0]);
                            for (let key in shaderUniformLocations) {
                                shaderUniformLocations[key] = this.get_uniform_location(key);
                            }
                            this.setIntermittentUniformVariables = setIntermittentUniformVariables.bind(this);
                            this.setIntermittentUniformVariables();

                            GLib.timeout_add(GLib.PRIORITY_DEFAULT, this._frametime, () => {
                                if ((now - lastPaint) > frametime) global.stage.queue_redraw();
                                return GLib.SOURCE_CONTINUE;
                            });

                            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, (() => {
                                this.setIntermittentUniformVariables();
                                return GLib.SOURCE_CONTINUE;
                            }).bind(this));
                            this._initialized = true;
                        }

                        if (this._dataView.byteLength === DATA_VIEW_LENGTH) {
                            setUniformMatrix(this, 'imu_quat_data', 4, this._dataView, IMU_QUAT_DATA);
                        } else if (this._dataView.byteLength !== 0) {
                            console.error(`Invalid dataView.byteLength: ${this._dataView.byteLength} !== ${DATA_VIEW_LENGTH}`)
                        }
                        
                        super.vfunc_paint_target(node, paintContext);
                    } else {
                        super.vfunc_paint_target(node, paintContext);
                    }
                    this._last_paint = now;
                }
            });

            this._xr_effect = new XREffect();
        }

        this._overlay.add_effect_with_name('xr-desktop', this._xr_effect);
        Meta.disable_unredirect_for_display(global.display);
    }

    disable() {
        if (this._running_poller_id) {
            GLib.source_remove(this._running_poller_id);
        } else {
            Meta.enable_unredirect_for_display(global.display);
            this._overlay.remove_effect_by_name('xr-desktop');
            this._cursorManager.disable();
            this._cursorManager = null;
        }
    }
}

function init() {
    return new Extension();
}
