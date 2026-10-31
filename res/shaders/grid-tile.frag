#version 300 es
precision highp float;

in vec2 v_texcoord;

uniform sampler2D u_texture;
uniform vec2 u_size;

out vec4 out_color;

void main() {
  vec2 uv = v_texcoord;
  vec4 color = texture(u_texture, uv);
  float scale = u_size.x;
  scale = smoothstep(32.0, 64.0, scale);
  color.rgb = mix(vec3(0.98), color.rgb, scale);
  out_color = color;
}
