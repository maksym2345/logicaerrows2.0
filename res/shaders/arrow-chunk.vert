#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_texcoord;
in float a_signal;

uniform vec2 u_resolution;
uniform vec2 u_offset;
uniform vec2 u_size;

out vec2 v_texcoord;
flat out float v_signal;

void main() {
  v_texcoord = a_texcoord;
  v_signal = a_signal;
  vec2 world = a_position + u_offset;
  vec2 pixel = world * u_size;
  vec2 clip_space = (pixel / u_resolution) * 2.0 - 1.0;
  clip_space.y = -clip_space.y;
  gl_Position = vec4(clip_space, 0.0, 1.0);
}
