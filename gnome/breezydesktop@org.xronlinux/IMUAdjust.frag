#version 330 core

uniform sampler2D uDesktopTexture;
uniform mat4 g_imu_quat_data;

vec4 quatMul(vec4 q1, vec4 q2) {
    vec3 u = vec3(q1.x, q1.y, q1.z);
    float s = q1.w;
    vec3 v = vec3(q2.x, q2.y, q2.z);
    float t = q2.w;
    return vec4(s*v + t*u + cross(u, v), s*t - dot(u, v));
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
	in float t_squared) {
	vec3 _91 = velocity * t;
	vec3 _92 = position + _91;
	vec3 _94 = vec3(5.00000000e-01, 5.00000000e-01, 5.00000000e-01) * accel;
	vec3 _96 = _94 * t_squared;
	vec3 _97 = _92 + _96;
	return _97;
}

vec4 quatMul(
	in vec4 q1,
	in vec4 q2) {
	vec3 _105 = vec3(q1.x, q1.y, q1.z);
	vec3 u = _105;
	float s = q1.w;
	vec3 _112 = vec3(q2.x, q2.y, q2.z);
	vec3 v = _112;
	float t_115 = q2.w;
	vec3 _117 = s * v;
	vec3 _119 = t_115 * u;
	vec3 _120 = _117 + _119;
	vec3 _121 = cross(u, v);
	vec3 _122 = _120 + _121;
	float _123 = s * t_115;
	float _124 = dot(u, v);
	float _125 = _123 - _124;
	vec4 _129 = vec4(_122.x, _122.y, _122.z, _125);
	return _129;
}

vec4 quatConj(
	in vec4 q) {
	float _134 = -(q.x);
	float _136 = -(q.y);
	float _138 = -(q.z);
	vec4 _140 = vec4(_134, _136, _138, q.w);
	return _140;
}

vec3 applyQuaternionToVector(
	in vec4 q,
	in vec3 v) {
	vec4 _149 = vec4(v.x, v.y, v.z, 0.00000000e+00);
	vec4 _150;
	vec4 _151;
	_150 = q;
	_151 = _149;
	vec4 _152 = quatMul(_150, _151);
	vec4 _153;
	_153 = q;
	vec4 _154 = quatConj(_153);
	vec4 _155;
	vec4 _156;
	_155 = _152;
	_156 = _154;
	vec4 _157 = quatMul(_155, _156);
	vec4 p = _157;
	return p.xyz;
}

vec3 rateOfChange(
	in vec3 v1,
	in vec3 v2,
	in float delta_time) {
	vec3 _165 = v1 - v2;
	vec3 _167 = _165 / delta_time;
	return _167;
}

bool isKeepaliveRecent(
	in vec4 currentDate,
	in vec4 keepAliveDate) {
	float _174 = currentDate.w + float(day_in_seconds);
	float _176 = _174 - keepAliveDate.w;
	float _178 = mod(_176, float(day_in_seconds));
	float _179 = abs(_178);
	bool _181 = _179 <= 5.00000000e+00;
	return _181;
}

void PS_IMU_Transform(vec4 pos, vec2 texcoord, out vec4 color) {
	float texcoord_x_min = 0.0;
	float texcoord_x_max = 1.0;
	vec2 screen_size = vec2(1920, 1080);
	float lens_y_offset = 0.0;
	float lens_z_offset = 0.0;

	float screen_aspect_ratio = screen_size.x / screen_size.y;
	float native_aspect_ratio = screen_aspect_ratio;

	float diag_to_vert_ratio = sqrt(screen_aspect_ratio * screen_aspect_ratio + 1.0);
	float half_fov_z_rads = radians(46.0 / diag_to_vert_ratio)/2.0;
	float half_fov_y_rads = half_fov_z_rads * screen_aspect_ratio;

	float screen_distance = 1.0 - 0.05;

	float lens_fov_z_offset_rads = atan(lens_z_offset/screen_distance);
	float fov_z_pos = tan(half_fov_z_rads - lens_fov_z_offset_rads) * screen_distance;
	float fov_z_neg = -tan(half_fov_z_rads + lens_fov_z_offset_rads) * screen_distance;
	float fov_z_width = fov_z_pos - fov_z_neg;

	float lens_fov_y_offset_rads = atan(lens_y_offset/screen_distance);
	float fov_y_pos = tan(half_fov_y_rads - lens_fov_y_offset_rads) * screen_distance;
	float fov_y_neg = -tan(half_fov_y_rads + lens_fov_y_offset_rads) * screen_distance;
	float fov_y_width = fov_y_pos - fov_y_neg;
	float vec_x = screen_distance;
	float vec_y = -texcoord.x * fov_y_width + fov_y_pos;
	float vec_z = -texcoord.y * fov_z_width + fov_z_pos;
	vec3 texcoord_vector = vec3(vec_x, vec_y, vec_z);
	vec3 lens_vector = vec3(0.05, lens_y_offset, lens_z_offset);

	vec3 res = applyQuaternionToVector(g_imu_quat_data[0], texcoord_vector);

	bool looking_behind = res.x < 0.0;

	// deconstruct the rotated and scaled vector back to a texcoord (just inverse operations of the first conversion
	// above)
	texcoord.x = (fov_y_pos - res.y) / fov_y_width;
	texcoord.y = (fov_z_pos - res.z) / fov_z_width;

	// apply the screen offsets now
	float texcoord_width = texcoord_x_max - texcoord_x_min;
	texcoord.x = texcoord.x * texcoord_width + texcoord_x_min;

	if (looking_behind || texcoord.x < texcoord_x_min || texcoord.y < 0.0 || texcoord.x > texcoord_x_max || texcoord.y > 1.0 || texcoord.x <= 0.005 && texcoord.y <= 0.005) {
		color = vec4(0, 0, 0, 1);
	} else {
		color = texture2D(uDesktopTexture, texcoord);
	}
}