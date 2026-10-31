#version 300 es
precision highp float;

in vec2 a_position;

uniform vec2 u_position; // x, y
uniform vec2 u_size; // width, height
uniform vec2 u_resolution; // viewport resolution
uniform vec2 u_rotation; // vec2(rotation angle), (flipped horizontally [0 or 1])

out vec2 v_texcoord;

void main() {
  v_texcoord = a_position;
  vec2 centered = a_position - 0.5;
  centered.x *= mix(1.0, -1.0, u_rotation.y);
  float angle = u_rotation.x;
  float cos_a = cos(angle);
  float sin_a = sin(angle);
  vec2 rotated = vec2(
    centered.x * cos_a - centered.y * sin_a,
    centered.x * sin_a + centered.y * cos_a
  );
  vec2 transformed = rotated + 0.5;
  vec2 sprite_position = transformed * u_size + u_position;
  vec2 clip_space = (sprite_position / u_resolution) * 2.0 - 1.0;
  clip_space.y = -clip_space.y;
  gl_Position = vec4(clip_space, 0.0, 1.0);
}
