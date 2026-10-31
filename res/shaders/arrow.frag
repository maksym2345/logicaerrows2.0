#version 300 es
precision highp float;

in vec2 v_texcoord;

uniform sampler2D u_texture;
uniform float u_alpha;
uniform int u_signal;
uniform vec2 u_sprite_position;
uniform float u_sprite_size;
uniform vec2 u_size;

out vec4 out_color;

const vec2 border = vec2(0.475);

const vec4 signal_colors[] = vec4[] (
  vec4(1.0, 1.0, 1.0, 0.0),
  vec4(1.0, 0.0, 0.0, 1.0),
  vec4(0.3, 0.5, 1.0, 1.0),
  vec4(1.0, 1.0, 0.0, 1.0),
  vec4(0.0, 0.8, 0.0, 1.0),
  vec4(1.0, 0.8, 0.2, 1.0),
  vec4(1.0, 0.2, 1.0, 1.0)
);

void main() {
  vec2 uv = v_texcoord;
  vec4 color = texture(u_texture, uv * u_sprite_size + u_sprite_position);
  vec3 gray = vec3(dot(color.rgb, vec3(0.299, 0.587, 0.114)));
  float scale = u_size.x;
  scale = smoothstep(16.0, 2.0, scale);
  color.rgb = mix(color.rgb, gray, scale * 0.66);
  vec3 base = color.rgb + signal_colors[u_signal].rgb * (1.0 - color.a);
  float alpha = color.a * u_alpha;
  alpha = mix(alpha, 0.75, scale);
  out_color = vec4(base, alpha);
}
