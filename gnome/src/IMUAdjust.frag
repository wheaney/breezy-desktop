#version 330 core

uniform sampler2D uDesktopTexture;
uniform sampler2D uCalibratingTexture;
uniform sampler2D uCustomBannerTexture;

uniform bool enabled;
uniform bool show_banner;
uniform mat4 imu_quat_data;
uniform vec4 look_ahead_cfg;
uniform float look_ahead_ms;
uniform float display_zoom;
uniform float display_north_offset;
uniform float lens_distance_ratio;
uniform bool sbs_enabled;
uniform bool sbs_content;
uniform bool custom_banner_enabled;
uniform float stage_aspect_ratio;
uniform float display_aspect_ratio;
uniform vec2 display_res;
uniform float trim_width_percent;
uniform float trim_height_percent;
uniform float half_fov_z_rads;
uniform float half_fov_y_rads;
uniform float screen_distance;

vec2 banner_position = vec2(0.5, 0.9);
float look_ahead_ms_cap = 45.0;

vec4 quatMul(vec4 q1, vec4 q2) {
    vec3 u = vec3(q1.x, q1.y, q1.z);
    float s = q1.w;
    vec3 v = vec3(q2.x, q2.y, q2.z);
    float t = q2.w;
    return vec4(s * v + t * u + cross(u, v), s * t - dot(u, v));
}

vec4 quatConj(vec4 q) {
    return vec4(-q.x, -q.y, -q.z, q.w);
}

vec3 applyQuaternionToVector(vec4 q, vec3 v) {
    vec4 p = quatMul(quatMul(q, vec4(v, 0)), quatConj(q));
    return p.xyz;
}

const int day_in_seconds = 24 * 60 * 60;

vec3 applyLookAhead(
    in vec3 position,
    in vec3 velocity,
    in vec3 accel,
    in float t,
    in float t_squared
) {
    return position + velocity * t + 0.5 * accel * t_squared;
}

vec3 rateOfChange(
    in vec3 v1,
    in vec3 v2,
    in float delta_time
) {
    return (v1 - v2) / delta_time;
}

void PS_IMU_Transform(vec4 pos, vec2 texcoord, out vec4 color) {
    float texcoord_x_min = 0.0;
    float texcoord_x_max = 1.0;
    float lens_y_offset = 0.0;
    float lens_z_offset = 0.0;
    float aspect_ratio = stage_aspect_ratio;

    // if(enabled && sbs_enabled) {
    //     bool right_display = texcoord.x > 0.5;
    //     aspect_ratio /= 2;

    //     lens_y_offset = lens_distance_ratio / 3;
    //     if(right_display)
    //         lens_y_offset = -lens_y_offset;
    //     if(sbs_content) {
    //         // source video is SBS, left-half of the screen goes to the left lens, right-half to the right lens
    //         if(right_display)
    //             texcoord_x_min = 0.5;
    //         else
    //             texcoord_x_max = 0.5;
    //     }
    //     if(!sbs_mode_stretched) {
    //         // if the content isn't stretched, assume it's centered in the middle 50% of the screen
    //         texcoord_x_min = max(0.25, texcoord_x_min);
    //         texcoord_x_max = min(0.75, texcoord_x_max);
    //     }

    //     // translate the texcoord respresenting the current lens's half of the screen to a full-screen texcoord
    //     texcoord.x = (texcoord.x - (right_display ? 0.5 : 0.0)) * 2;
    // }

    if(!enabled || show_banner) {
		vec2 banner_size = vec2(800.0 / display_res.x, 200.0 / display_res.y); // Assuming ScreenWidth and ScreenHeight are defined

        bool banner_shown = false;
        if (show_banner) {
            // if the banner width is greater than the sreen width, scale it down
            banner_size /= max(banner_size.x, 1.1);

            vec2 banner_start = banner_position - banner_size / 2;

            // if the banner would extend too close or past the bottom edge of the screen, apply some padding
            banner_start.y = min(banner_start.y, 0.95 - banner_size.y);

            vec2 banner_texcoord = (texcoord - banner_start) / banner_size;
            if (banner_texcoord.x >= 0.0 && banner_texcoord.x <= 1.0 && banner_texcoord.y >= 0.0 && banner_texcoord.y <= 1.0) {
                banner_shown = true;
                if (custom_banner_enabled) {
                    color = texture2D(uCustomBannerTexture, banner_texcoord);
                } else {
                    color = texture2D(uCalibratingTexture, banner_texcoord);
                }
            }
        }
        
        if (!banner_shown) {
            // adjust texcoord back to the range that describes where the content is displayed
            float texcoord_width = texcoord_x_max - texcoord_x_min;
            texcoord.x = texcoord.x * texcoord_width + texcoord_x_min;

            color = texture2D(uDesktopTexture, texcoord);
        }
    } else {
        float fov_y_half_width = tan(half_fov_y_rads);
        float fov_y_width = fov_y_half_width * 2;
        float fov_z_half_width = tan(half_fov_z_rads);
        float fov_z_width = fov_z_half_width * 2;
        
        float vec_y = -texcoord.x * fov_y_width + fov_y_half_width;
        float vec_z = -texcoord.y * fov_z_width + fov_z_half_width;
        vec3 lens_vector = vec3(lens_distance_ratio, lens_y_offset, lens_z_offset);
        vec3 texcoord_vector = vec3(1.0, vec_y, vec_z);

        // then rotate the vector using each of the snapshots provided
        vec3 rotated_vector_t0 = applyQuaternionToVector(imu_quat_data[0], texcoord_vector);
        vec3 rotated_vector_t1 = applyQuaternionToVector(imu_quat_data[1], texcoord_vector);
        vec3 rotated_vector_t2 = applyQuaternionToVector(imu_quat_data[2], texcoord_vector);
        vec3 rotated_lens_vector = applyQuaternionToVector(imu_quat_data[0], lens_vector);

        // compute the two velocities (units/ms) as change in the 3 rotation snapshots
        float delta_time_t0 = imu_quat_data[3].x - imu_quat_data[3].y;
        vec3 velocity_t0 = rateOfChange(rotated_vector_t0, rotated_vector_t1, delta_time_t0);
        vec3 velocity_t1 = rateOfChange(rotated_vector_t1, rotated_vector_t2, imu_quat_data[3].y - imu_quat_data[3].z);

        // and then the acceleration (units/ms^2) as the change in velocities
        vec3 accel_t0 = rateOfChange(velocity_t0, velocity_t1, delta_time_t0);

        // allows for the bottom and top of the screen to have different look-ahead values
        float look_ahead_scanline_adjust = texcoord.y * look_ahead_cfg.z;

        // use the 4th value of the look-ahead config to cap the look-ahead value
        float look_ahead_ms_capped = min(min(look_ahead_ms, look_ahead_cfg.w), look_ahead_ms_cap) + look_ahead_scanline_adjust;
        float look_ahead_ms_squared = pow(look_ahead_ms_capped, 2);

        // apply most recent velocity and acceleration to most recent position to get a predicted position
        vec3 res = applyLookAhead(rotated_vector_t0, velocity_t0, accel_t0, look_ahead_ms, look_ahead_ms_squared) -
            rotated_lens_vector;

        bool looking_behind = res.x < 0.0;

        // divide all values by x to scale the magnitude so x is exactly 1, and multiply by the final display distance
        // so the vector is pointing at a coordinate on the screen
        float display_distance = display_north_offset - rotated_lens_vector.x;
        res *= display_distance / res.x;
        res += rotated_lens_vector;

		// deconstruct the rotated and scaled vector back to a texcoord (just inverse operations of the first conversion
		// above)
        texcoord.x = (fov_y_half_width - res.y) / fov_y_width;
        texcoord.y = (fov_z_half_width - res.z) / fov_z_width;

		// apply the screen offsets now
        float texcoord_width = texcoord_x_max - texcoord_x_min;
        texcoord.x = texcoord.x * texcoord_width + texcoord_x_min;

        if(looking_behind || texcoord.x < texcoord_x_min || texcoord.y < 0.0 || texcoord.x > texcoord_x_max || texcoord.y > 1.0 || texcoord.x <= 0.001 && texcoord.y <= 0.002) {
            color = vec4(0, 0, 0, 1);
        } else {
            texcoord.x = (1.0 - trim_width_percent * 2) * texcoord.x + trim_width_percent;
            texcoord.y = (1.0 - trim_height_percent * 2) * texcoord.y + trim_height_percent;
            color = texture2D(uDesktopTexture, texcoord);
        }
    }
}