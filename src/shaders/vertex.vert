#version 300 es
in vec2 position;
out vec2 v_uv;

void main() {
    v_uv = position * 0.5 + 0.5;
    v_uv.y = 1.0 - v_uv.y; // Standard video texture flip
    gl_Position = vec4(position, 0.0, 1.0);
}
