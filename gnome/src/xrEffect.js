import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GdkPixbuf from 'gi://GdkPixbuf';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';

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
    DATA_VIEW_INFO_COUNT_INDEX,
    DATA_VIEW_INFO_OFFSET_INDEX,
    FLOAT_SIZE,
    UINT_SIZE,
    UINT8_SIZE
} from "./ipc.js";
import { degreeToRadian } from "./math.js";
import { getShaderSource } from "./shader.js";
import { isValidKeepAlive, toSec } from "./time.js";

export const IPC_FILE_PATH = "/dev/shm/breezy_desktop_imu";

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

// cached after first retrieval
const shaderUniformLocations = {
    'virtual_display_enabled': null,
    'show_banner': null,
    'imu_quat_data': null,
    'look_ahead_cfg': null,
    'look_ahead_ms': null,
    'trim_percent': null,
    'display_size': null,
    'display_north_offset': null,
    'lens_vector': null,
    'lens_vector_r': null,          // only used if sbs_enabled is true
    'texcoord_x_limits': null,      // index 0: min; index 1: max
    'texcoord_x_limits_r': null,    // only used if sbs_enabled is true
    'sbs_enabled': null,
    'custom_banner_enabled': null,
    'half_fov_z_rads': null,
    'half_fov_y_rads': null,
    'fov_half_widths': null,
    'fov_widths': null,
    'display_resolution': null,
    'source_to_display_ratio': null,
    'curved_display': null,

    // only used by the reshade integration, but needs to be set to a default value by this effect
    'frametime': null,
    'sideview_enabled': null,
    'sideview_position': null,
    'sideview_display_size': null
};

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
    try {
        const dataView = this._dataView;

        if (dataView.byteLength === DATA_VIEW_LENGTH) {
            const version = dataViewUint8(dataView, VERSION);
            const imuDateMs = dataViewBigUint(dataView, EPOCH_MS);
            const validKeepalive = isValidKeepAlive(toSec(imuDateMs));
            const imuData = dataViewFloatArray(dataView, IMU_QUAT_DATA);
            const imuResetState = validKeepalive && imuData[0] === 0.0 && imuData[1] === 0.0 && imuData[2] === 0.0 && imuData[3] === 1.0;
            const enabled = dataViewUint8(dataView, ENABLED) !== 0 && version === DATA_LAYOUT_VERSION && validKeepalive;
            const displayRes = dataViewUint32Array(dataView, DISPLAY_RES);
            const sbsEnabled = dataViewUint8(dataView, SBS_ENABLED) !== 0;

            if (enabled) {
                const displayFov = dataViewFloat(dataView, DISPLAY_FOV);

                // TODO - drive these values from settings
                const sbsContent = false;
                const sbsModeStretched = true;

                // compute these values once, they only change when the XR device changes
                const displayAspectRatio = displayRes[0] / displayRes[1];
                const diagToVertRatio = Math.sqrt(Math.pow(displayAspectRatio, 2) + 1);
                const halfFovZRads = degreeToRadian(displayFov / diagToVertRatio) / 2;
                const halfFovYRads = halfFovZRads * displayAspectRatio;
                const fovHalfWidths = [Math.tan(halfFovYRads), Math.tan(halfFovZRads)];
                const fovWidths = [fovHalfWidths[0] * 2, fovHalfWidths[1] * 2];
                const lensDistanceRatio = dataViewFloat(dataView, LENS_DISTANCE_RATIO);
                let lensFromCenter = 0.0;
                let texcoordXLimits = [0.0, 1.0];
                let texcoordXLimitsRight = [0.0, 1.0];
                if (sbsEnabled) {
                    lensFromCenter = lensDistanceRatio / 3.0;
                    if (sbsContent) {
                        texcoordXLimits[1] = 0.5;
                        texcoordXLimitsRight[0] = 0.5;
                        if (!sbsModeStretched) {
                            texcoordXLimits[0] = 0.25;
                            texcoordXLimitsRight[1] = 0.75;
                        }
                    } else if (!sbsModeStretched) {
                        texcoordXLimits[0] = 0.25;
                        texcoordXLimits[1] = 0.75;
                        texcoordXLimitsRight[0] = 0.25;
                        texcoordXLimitsRight[1] = 0.75;
                    }
                }
                const lensVector = [lensDistanceRatio, lensFromCenter, 0.0];
                const lensVectorRight = [lensDistanceRatio, -lensFromCenter, 0.0];

                // our overlay doesn't quite cover the full screen texture, which allows us to see some of the real desktop
                // underneath, so we trim three pixels around the entire edge of the texture
                const trimWidthPercent = 3.0 / this.target_monitor.width;
                const trimHeightPercent = 3.0 / this.target_monitor.height;
                
                // all these values are transferred directly, unmodified from the driver
                transferUniformFloat(this, 'look_ahead_cfg', dataView, LOOK_AHEAD_CFG);
                transferUniformFloat(this, 'lens_distance_ratio', dataView, LENS_DISTANCE_RATIO);

                // computed values with no dataViewInfo, so we set these manually
                this.set_uniform_float(shaderUniformLocations['trim_percent'], 2, [trimWidthPercent, trimHeightPercent]);
                setSingleFloat(this, 'half_fov_z_rads', halfFovZRads);
                setSingleFloat(this, 'half_fov_y_rads', halfFovYRads);
                this.set_uniform_float(shaderUniformLocations['fov_half_widths'], 2, fovHalfWidths);
                this.set_uniform_float(shaderUniformLocations['fov_widths'], 2, fovWidths);
                setSingleFloat(this, 'curved_display', this.curved_display ? 1.0 : 0.0);
                this.set_uniform_float(shaderUniformLocations['texcoord_x_limits'], 2, texcoordXLimits);
                this.set_uniform_float(shaderUniformLocations['texcoord_x_limits_r'], 2, texcoordXLimitsRight);
                this.set_uniform_float(shaderUniformLocations['lens_vector'], 3, lensVector);
                this.set_uniform_float(shaderUniformLocations['lens_vector_r'], 3, lensVectorRight);
            }

            // update the supported device detected property if the state changes, trigger "notify::" events
            if (this.supported_device_detected !== validKeepalive) this.supported_device_detected = validKeepalive;

            // update the widescreen property if the state changes while still enabled, trigger "notify::" events
            if (enabled && this.widescreen_mode_state !== sbsEnabled) this.widescreen_mode_state = sbsEnabled;

            // these variables are always in play, even if enabled is false
            setSingleFloat(this, 'virtual_display_enabled', enabled ? 1.0 : 0.0);
            setSingleFloat(this, 'show_banner', imuResetState ? 1.0 : 0.0);
            setSingleFloat(this, 'sbs_enabled', sbsEnabled ? 1.0 : 0.0);
            setSingleFloat(this, 'custom_banner_enabled', dataViewUint8(dataView, CUSTOM_BANNER_ENABLED) !== 0 ? 1.0 : 0.0);
            setSingleFloat(this, 'frametime', 0.0);
            
            setSingleFloat(this, 'sideview_enabled', 0.0);
            setSingleFloat(this, 'sideview_position', 0.0);
            setSingleFloat(this, 'sideview_display_size', 1.0);

            this.set_uniform_float(shaderUniformLocations['display_resolution'], 2, displayRes);
            this.set_uniform_float(shaderUniformLocations['source_to_display_ratio'], 2, [this.target_monitor.width/displayRes[0], this.target_monitor.height/displayRes[1]]);
        } else if (dataView.byteLength !== 0) {
            throw new Error(`Invalid dataView.byteLength: ${dataView.byteLength} !== ${DATA_VIEW_LENGTH}`);
        }
    } catch (e) {
        Globals.logger.log(`ERROR: xrEffect.js setIntermittentUniformVariables ${e.message}\n${e.stack}`);
    }
}

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

export const XREffect = GObject.registerClass({
    Properties: {
        'supported-device-detected': GObject.ParamSpec.boolean(
            'supported-device-detected',
            'Supported device detected',
            'Whether a supported device is connected',
            GObject.ParamFlags.READWRITE,
            false
        ),
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
            GObject.ParamFlags.READWRITE, 30, 240, 60
        ),
        'display-distance': GObject.ParamSpec.double(
            'display-distance',
            'Display Distance',
            'How far away the display appears',
            GObject.ParamFlags.READWRITE, 
            0.2, 
            2.5, 
            1.05
        ),
        'display-size': GObject.ParamSpec.double(
            'display-size',
            'Display size',
            'Size of the display',
            GObject.ParamFlags.READWRITE,
            0.2,
            2.5,
            1.0
        ),
        'toggle-display-distance-start': GObject.ParamSpec.double(
            'toggle-display-distance-start',
            'Display distance start',
            'Start distance when using the "change distance" shortcut.',
            GObject.ParamFlags.READWRITE, 
            0.2, 
            2.5, 
            1.05
        ),
        'toggle-display-distance-end': GObject.ParamSpec.double(
            'toggle-display-distance-end',
            'Display distance end',
            'End distance when using the "change distance" shortcut.',
            GObject.ParamFlags.READWRITE, 
            0.2, 
            2.5, 
            1.05
        ),
        'curved-display': GObject.ParamSpec.boolean(
            'curved-display',
            'Curved Display',
            'Whether the display is curved',
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
        'look-ahead-override': GObject.ParamSpec.int(
            'look-ahead-override',
            'Look ahead override',
            'Override the look ahead value',
            GObject.ParamFlags.READWRITE,
            -1,
            45,
            -1
        ),
        'disable-anti-aliasing': GObject.ParamSpec.boolean(
            'disable-anti-aliasing',
            'Disable anti-aliasing',
            'Disable anti-aliasing for the effect',
            GObject.ParamFlags.READWRITE,
            false
        )
    }
}, class XREffect extends Shell.GLSLEffect {
    constructor(params = {}) {
        super(params);

        this._distance_ease_timeline = null;
        this.connect('notify::toggle-display-distance-start', this._handle_display_distance_properties_change.bind(this));
        this.connect('notify::toggle-display-distance-end', this._handle_display_distance_properties_change.bind(this));
        this.connect('notify::display-distance', this._handle_display_distance_properties_change.bind(this));
        this._handle_display_distance_properties_change();

        const calibrating = GdkPixbuf.Pixbuf.new_from_file(`${Globals.extension_dir}/textures/calibrating.png`);
        this.calibratingImage = new Clutter.Image();
        this.calibratingImage.set_data(calibrating.get_pixels(), Cogl.PixelFormat.RGB_888,
                                       calibrating.width, calibrating.height, calibrating.rowstride);

        const customBanner = GdkPixbuf.Pixbuf.new_from_file(`${Globals.extension_dir}/textures/custom_banner.png`);
        this.customBannerImage = new Clutter.Image();
        this.customBannerImage.set_data(customBanner.get_pixels(), Cogl.PixelFormat.RGB_888,
                                        customBanner.width, customBanner.height, customBanner.rowstride);
    }

    _handle_display_distance_properties_change() {
        const distance_from_end = Math.abs(this.display_distance - this.toggle_display_distance_end);
        const distance_from_start = Math.abs(this.display_distance - this.toggle_display_distance_start);
        this._is_display_distance_at_end = distance_from_end < distance_from_start;
    }

    _change_distance() {
        if (this._distance_ease_timeline?.is_playing()) this._distance_ease_timeline.stop();

        this._distance_ease_start = this.display_distance;
        this._distance_ease_timeline = Clutter.Timeline.new_for_actor(this.get_actor(), 250);

        const toggle_display_distance_target = this._is_display_distance_at_end ? 
            this.toggle_display_distance_start : this.toggle_display_distance_end;
        this._distance_ease_timeline.connect('new-frame', () => {
            this.display_distance = this._distance_ease_start + 
                this._distance_ease_timeline.get_progress() * 
                (toggle_display_distance_target - this._distance_ease_start);
        });

        this._distance_ease_timeline.start();
    }

    vfunc_build_pipeline() {
        const code = getShaderSource(`${Globals.extension_dir}/Sombrero.frag`);
        const main = 'PS_Sombrero(virtual_display_enabled, false, source_to_display_ratio, show_banner, cogl_tex_coord_in[0].xy, cogl_color_out);';
        this.add_glsl_snippet(Shell.SnippetHook.FRAGMENT, code, main, false);
    }

    vfunc_paint_target(node, paintContext) {
        var calibratingImage = this.calibratingImage;
        var customBannerImage = this.customBannerImage;
        let data = Globals.ipc_file.load_contents(null);
        if (data[0]) {
            let buffer = new Uint8Array(data[1]).buffer;
            this._dataView = new DataView(buffer);
            if (!this._initialized) {
                this.set_uniform_float(this.get_uniform_location('screenTexture'), 1, [0]);

                this.get_pipeline().set_layer_texture(1, calibratingImage.get_texture());
                this.get_pipeline().set_layer_texture(2, customBannerImage.get_texture());
                this.get_pipeline().set_uniform_1i(this.get_uniform_location('calibratingTexture'), 1);
                this.get_pipeline().set_uniform_1i(this.get_uniform_location('customBannerTexture'), 2);

                for (let key in shaderUniformLocations) {
                    shaderUniformLocations[key] = this.get_uniform_location(key);
                }
                this.setIntermittentUniformVariables = setIntermittentUniformVariables.bind(this);
                this.setIntermittentUniformVariables();

                this._redraw_timeline = Clutter.Timeline.new_for_actor(this.get_actor(), 1000);
                this._redraw_timeline.connect('new-frame', (() => {
                    this.queue_repaint();
                }).bind(this));
                this._redraw_timeline.set_repeat_count(-1);
                this._redraw_timeline.start();

                this._uniforms_timeout_id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, (() => {
                    this.setIntermittentUniformVariables();
                    return GLib.SOURCE_CONTINUE;
                }).bind(this));

                this._initialized = true;
            }

            let success = false;
            let attempts = 0;
            while (!success && attempts < 2) {
                if (this._dataView.byteLength === DATA_VIEW_LENGTH) {
                    if (checkParityByte(this._dataView)) {
                        setSingleFloat(this, 'display_north_offset', this.display_distance);
                        setSingleFloat(this, 'look_ahead_ms', 
                            this.look_ahead_override === -1 ? lookAheadMS(this._dataView) : this.look_ahead_override);
                        setUniformMatrix(this, 'imu_quat_data', 4, this._dataView, IMU_QUAT_DATA);
                        setSingleFloat(this, 'display_size', this.display_size);
                        success = true;
                    }
                } else if (this._dataView.byteLength !== 0) {
                    Globals.logger.log(`ERROR: Invalid dataView.byteLength: ${this._dataView.byteLength} !== ${DATA_VIEW_LENGTH}`)
                }

                if (!success && ++attempts < 3) {
                    data = Globals.ipc_file.load_contents(null);
                    if (data[0]) {
                        buffer = new Uint8Array(data[1]).buffer;
                        this._dataView = new DataView(buffer);
                    }
                }
            }

            if (!this.disable_anti_aliasing) {
                // improves sampling quality for smooth text and edges
                this.get_pipeline().set_layer_filters(
                    0,
                    Cogl.PipelineFilter.LINEAR_MIPMAP_LINEAR,
                    Cogl.PipelineFilter.LINEAR
                );
            }
        }
        super.vfunc_paint_target(node, paintContext);
    }

    cleanup() {
        if (this._redraw_timeline) {
            this._redraw_timeline.stop();
            this._redraw_timeline = null;
        }
        if (this._uniforms_timeout_id) GLib.source_remove(this._uniforms_timeout_id);
    }
});