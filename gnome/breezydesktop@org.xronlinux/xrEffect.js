import Cogl from 'gi://Cogl';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';

import Globals from './globals.js';
import { 
    dataViewEnd,
    dataViewUint8,
    dataViewBigUint,
    dataViewUintArray,
    dataViewFloat,
    dataViewFloatArray,
    BOOL_SIZE,
    DATA_VIEW_INFO_COUNT_INDEX,
    DATA_VIEW_INFO_OFFSET_INDEX,
    FLOAT_SIZE,
    UINT_SIZE,
    UINT8_SIZE
} from "./ipc.js";
import { degreeToRadian } from "./math.js";
import { getShaderSource } from "./shader.js";
import { toSec } from "./time.js";

export const IPC_FILE_PATH = "/dev/shm/breezy_desktop_imu";

// the driver should be using the same data layout version
const DATA_LAYOUT_VERSION = 2;

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
const DATA_VIEW_LENGTH = dataViewEnd(IMU_QUAT_DATA);

// cached after first retrieval
const shaderUniformLocations = {
    'enabled': null,
    'show_banner': null,
    'imu_quat_data': null,
    'look_ahead_cfg': null,
    'look_ahead_ms': null,
    'stage_aspect_ratio': null,
    'display_aspect_ratio': null,
    'trim_width_percent': null,
    'trim_height_percent': null,
    'display_zoom': null,
    'display_north_offset': null,
    'lens_distance_ratio': null,
    'sbs_enabled': null,
    'sbs_content': null,
    'custom_banner_enabled': null,
    'half_fov_z_rads': null,
    'half_fov_y_rads': null,
    'screen_distance': null
};

function transferUniformBoolean(effect, location, dataView, dataViewInfo) {
    // GLSL bool is a float under the hood, evaluates false if 0 or 0.0, true otherwise
    effect.set_uniform_float(location, 1, [dataViewUint8(dataView, dataViewInfo)]);
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

function lookAheadMS(dataView) {
    const lookAheadCfg = dataViewFloatArray(dataView, LOOK_AHEAD_CFG);
    const imuDateMS = dataViewBigUint(dataView, EPOCH_MS);

    // how stale the imu data is
    const dataAge = Date.now() - imuDateMS;

    return lookAheadCfg[0] + dataAge;
}

// most uniforms don't change frequently, this function should be called periodically
function setIntermittentUniformVariables() {
    const dataView = this._dataView;

    if (dataView.byteLength === DATA_VIEW_LENGTH) {
        const version = dataViewUint8(dataView, VERSION);
        const imuDateMS = dataViewBigUint(dataView, EPOCH_MS);
        const currentDateMS = Date.now();
        const validKeepalive = Math.abs(toSec(currentDateMS) - toSec(imuDateMS)) < 5;
        const imuData = dataViewFloatArray(dataView, IMU_QUAT_DATA);
        const imuResetState = imuData[0] === 0.0 && imuData[1] === 0.0 && imuData[2] === 0.0 && imuData[3] === 1.0;
        const enabled = dataViewUint8(dataView, ENABLED) !== 0 && version === DATA_LAYOUT_VERSION && validKeepalive && !imuResetState;

        if (enabled) {
            const displayRes = dataViewUintArray(dataView, DISPLAY_RES);
            const displayFov = dataViewFloat(dataView, DISPLAY_FOV);
            const lensDistanceRatio = dataViewFloat(dataView, LENS_DISTANCE_RATIO);

            // compute these values once, they only change when the XR device changes
            const displayAspectRatio = displayRes[0] / displayRes[1];
            const stageAspectRatio = this.target_monitor.width / this.target_monitor.height;
            const diagToVertRatio = Math.sqrt(Math.pow(stageAspectRatio, 2) + 1);
            const halfFovZRads = degreeToRadian(displayFov / diagToVertRatio) / 2;
            const halfFovYRads = halfFovZRads * stageAspectRatio;
            const screenDistance = 1.0 - lensDistanceRatio;

            // our overlay doesn't quite cover the full screen texture, which allows us to see some of the real desktop
            // underneath, so we trim two pixels around the entire edge of the texture
            const trimWidthPercent = 2.0 / this.target_monitor.width;
            const trimHeightPercent = 2.0 / this.target_monitor.height;
            
            // all these values are transferred directly, unmodified from the driver
            transferUniformFloat(this, 'look_ahead_cfg', dataView, LOOK_AHEAD_CFG);
            transferUniformFloat(this, 'lens_distance_ratio', dataView, LENS_DISTANCE_RATIO);
            transferUniformBoolean(this, 'sbs_enabled', dataView, SBS_ENABLED);
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

            // TOOD - drive from settings
            setSingleFloat(this, 'display_zoom', 1.0);
            setSingleFloat(this, 'display_north_offset', 1.0);
            setSingleFloat(this, 'sbs_content', 0.0);
        }
        setSingleFloat(this, 'enabled', enabled ? 1.0 : 0.0);
    } else if (dataView.byteLength !== 0) {
        console.error(`Invalid dataView.byteLength: ${dataView.byteLength} !== ${DATA_VIEW_LENGTH}`)
    }
}

export const XREffect = GObject.registerClass({
    Properties: {
        'target-monitor': GObject.ParamSpec.jsobject(
            'target-monitor', 
            'Target Monitor', 
            'Geometry of the target monitor for this effect', 
            GObject.ParamFlags.READWRITE
        ),
        'target-framerate': GObject.ParamSpec.uint(
            'target-framerate', 
            'Target Framerate', 
            'Target framerate for this effect',
            GObject.ParamFlags.READWRITE, 60, 240, 60
        )
    }
}, class XREffect extends Shell.GLSLEffect {
    constructor(params = {}) {
        super(params);

        this._frametime = Math.floor(1000 / this.target_framerate);
    }

    vfunc_build_pipeline() {
        const code = getShaderSource(`${Globals.extension_dir}/IMUAdjust.frag`);
        const main = 'PS_IMU_Transform(vec4(0, 0, 0, 0), cogl_tex_coord_in[0].xy, cogl_color_out);';
        this.add_glsl_snippet(Shell.SnippetHook.FRAGMENT, code, main, false);
    }

    vfunc_paint_target(node, paintContext) {
        var now = Date.now();
        var lastPaint = this._last_paint || 0;
        var frametime = this._frametime;
        const data = Globals.ipc_file.load_contents(null);
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

                this._redraw_timeout_id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this._frametime, () => {
                    if ((now - lastPaint) > frametime) global.stage.queue_redraw();
                    return GLib.SOURCE_CONTINUE;
                });

                this._uniforms_timeout_id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, (() => {
                    this.setIntermittentUniformVariables();
                    return GLib.SOURCE_CONTINUE;
                }).bind(this));
                this._initialized = true;
            }

            if (this._dataView.byteLength === DATA_VIEW_LENGTH) {
                setSingleFloat(this, 'look_ahead_ms', lookAheadMS(this._dataView));
                setUniformMatrix(this, 'imu_quat_data', 4, this._dataView, IMU_QUAT_DATA);
            } else if (this._dataView.byteLength !== 0) {
                console.error(`Invalid dataView.byteLength: ${this._dataView.byteLength} !== ${DATA_VIEW_LENGTH}`)
            }

            // improves sampling quality for smooth text and edges
            this.get_pipeline().set_layer_filters (
                0,
                Cogl.PipelineFilter.LINEAR_MIPMAP_LINEAR,
                Cogl.PipelineFilter.LINEAR
            );
            
            super.vfunc_paint_target(node, paintContext);
        } else {
            super.vfunc_paint_target(node, paintContext);
        }
        this._last_paint = now;
    }

    vfunc_dispose() {
        if (this._redraw_timeout_id) GLib.source_remove(this._redraw_timeout_id);
        if (this._uniforms_timeout_id) GLib.source_remove(this._uniforms_timeout_id);
    }
});