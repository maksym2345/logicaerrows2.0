#version 300 es
precision highp float;

in vec2 v_texcoord;

uniform float u_scale;
uniform float u_show_chunk_borders;

out vec4 out_color;

void main() {
  vec2 uv = v_texcoord;
  vec2 grid = fract(uv * u_scale) - 0.05;
  float color = 1.0 - step(min(grid.x, grid.y), 0.0) * 0.2;
  out_color = vec4(vec3(color), 1.0);
  uv -= 0.025 / u_scale;
  if (u_show_chunk_borders > 0.5) {
    if (abs(uv.x - 0.5) < 0.025 / u_scale || abs(uv.y - 0.5) < 0.025 / u_scale) {
      out_color.rgb *= 0.75;
    }
  }
}