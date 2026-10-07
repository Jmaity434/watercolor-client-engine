#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_video;
uniform sampler2D u_paperTexture;
uniform vec2      u_resolution;
uniform float     u_time;
uniform float     u_bleed;         // 0.0 - 1.0 (pigment bleeding & wetness)
uniform float     u_brushSize;     // 0.0 - 1.0 (soft stroke size)
uniform float     u_paperGrain;    // 0.0 - 1.0 (cold-press paper texture intensity)
uniform float     u_vibrance;      // 0.0 - 1.5 (rich pigment saturation)
uniform float     u_edgeDarken;    // 0.0 - 1.0 (coffee-ring pigment edge accumulation)
uniform vec2      u_uvScale;
uniform vec2      u_uvOffset;
uniform float     u_fitMode;       // 0.0 = fill, 1.0 = contain, 2.0 = cover

// Luminance helper
float luma(vec3 c) {
    return dot(c, vec3(0.299, 0.587, 0.114));
}

// Cheap procedural hash
float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

void main() {
    vec2 uv = (v_uv - u_uvOffset) / u_uvScale;

    // Contain mode letterboxing
    if (u_fitMode > 0.5 && u_fitMode < 1.5) {
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
            fragColor = vec4(0.04, 0.035, 0.03, 1.0);
            return;
        }
    }

    vec2 texel = vec2(1.0) / max(u_resolution, vec2(1.0));
    float strokeRadius = mix(1.2, 3.5, u_brushSize);

    // -------------------------------------------------------------
    // 1. Soft Brushstrokes via 4-Sector Kuwahara Filter
    // -------------------------------------------------------------
    vec3 mean[4];
    vec3 variance[4];

    for (int k = 0; k < 4; k++) {
        mean[k] = vec3(0.0);
        variance[k] = vec3(0.0);
    }

    // Quadrant bounds: (x0, x1, y0, y1)
    vec4 qBounds[4] = vec4[](
        vec4(-1.0, 0.0, -1.0, 0.0), // Bottom-Left
        vec4( 0.0, 1.0, -1.0, 0.0), // Bottom-Right
        vec4(-1.0, 0.0,  0.0, 1.0), // Top-Left
        vec4( 0.0, 1.0,  0.0, 1.0)  // Top-Right
    );

    float samplesPerQuad = 0.0;
    for (float dx = 0.0; dx <= 1.0; dx += 0.5) {
        for (float dy = 0.0; dy <= 1.0; dy += 0.5) {
            samplesPerQuad += 1.0;
            for (int k = 0; k < 4; k++) {
                vec2 offset = vec2(
                    mix(qBounds[k].x, qBounds[k].y, dx),
                    mix(qBounds[k].z, qBounds[k].w, dy)
                ) * strokeRadius * texel;

                vec3 col = texture(u_video, clamp(uv + offset, 0.0, 1.0)).rgb;
                mean[k] += col;
                variance[k] += col * col;
            }
        }
    }

    // Compute mean and variance for each quadrant
    float minVar = 1e9;
    vec3 paintedColor = texture(u_video, uv).rgb;

    for (int k = 0; k < 4; k++) {
        mean[k] /= samplesPerQuad;
        vec3 varVec = abs(variance[k] / samplesPerQuad - mean[k] * mean[k]);
        float v = dot(varVec, vec3(0.299, 0.587, 0.114));
        if (v < minVar) {
            minVar = v;
            paintedColor = mean[k];
        }
    }

    // -------------------------------------------------------------
    // 2. Pigment Bleed & Wet-on-Wet Capillary Flow
    // -------------------------------------------------------------
    float bleedDist = mix(2.0, 6.0, u_bleed);
    vec3 bleedColor = paintedColor;
    float bleedWeight = 1.0;

    // Sample bleed in 8 radial directions
    const vec2 bleedDirs[8] = vec2[](
        vec2( 1.0,  0.0), vec2(-1.0,  0.0),
        vec2( 0.0,  1.0), vec2( 0.0, -1.0),
        vec2( 0.7,  0.7), vec2(-0.7,  0.7),
        vec2( 0.7, -0.7), vec2(-0.7, -0.7)
    );

    for (int i = 0; i < 8; i++) {
        vec2 bUv = clamp(uv + bleedDirs[i] * bleedDist * texel, 0.0, 1.0);
        vec3 neighbor = texture(u_video, bUv).rgb;

        // Warm color bleed bias (deep reds and golden yellows bleed more dynamically)
        float isWarm = smoothstep(0.1, 0.7, neighbor.r - neighbor.b * 0.5);
        float w = exp(-distance(paintedColor, neighbor) * 2.8) * (1.0 + isWarm * 0.6);

        bleedColor += neighbor * w;
        bleedWeight += w;
    }

    vec3 wetPigment = mix(paintedColor, bleedColor / bleedWeight, u_bleed * 0.55);

    // -------------------------------------------------------------
    // 3. Pigment Edge Darkening (Coffee-Ring / Drying Edge Accumulation)
    // -------------------------------------------------------------
    vec3 colL = texture(u_video, clamp(uv - vec2(texel.x, 0.0) * 2.0, 0.0, 1.0)).rgb;
    vec3 colR = texture(u_video, clamp(uv + vec2(texel.x, 0.0) * 2.0, 0.0, 1.0)).rgb;
    vec3 colT = texture(u_video, clamp(uv + vec2(0.0, texel.y) * 2.0, 0.0, 1.0)).rgb;
    vec3 colB = texture(u_video, clamp(uv - vec2(0.0, texel.y) * 2.0, 0.0, 1.0)).rgb;

    float edgeGrad = length(colR - colL) + length(colT - colB);
    float edgeMask = smoothstep(0.08, 0.45, edgeGrad) * u_edgeDarken;

    // Darken wet edges with a warm natural sepia-burnt-umber tone
    vec3 ringColor = wetPigment * vec3(0.72, 0.65, 0.60);
    wetPigment = mix(wetPigment, ringColor, edgeMask * 0.42);

    // -------------------------------------------------------------
    // 4. Vibrant Palette Tuning: Bleeding Deep Reds, Rich Yellows, & Soft Creams
    // -------------------------------------------------------------
    // Deep reds boost (warm cadmium/crimson punch)
    float redDominance = max(0.0, wetPigment.r - max(wetPigment.g, wetPigment.b));
    wetPigment.r += redDominance * 0.22 * u_vibrance;
    wetPigment.g += redDominance * 0.04 * u_vibrance; // subtle warm undertone

    // Golden yellow / ochre glow
    float yellowTone = min(wetPigment.r, wetPigment.g) * (1.0 - wetPigment.b);
    wetPigment.r += yellowTone * 0.14 * u_vibrance;
    wetPigment.g += yellowTone * 0.12 * u_vibrance;
    wetPigment.b *= mix(1.0, 0.90, u_vibrance); // soften harsh blue into warm cream

    // Soft Creamy Highlights (Roll off pure digital whites to warm watercolor parchment cream)
    float lum = luma(wetPigment);
    vec3 creamPaperWash = vec3(1.02, 0.97, 0.90); // soft warm cream tint
    if (lum > 0.65) {
        float creamFactor = smoothstep(0.65, 1.0, lum) * 0.35;
        wetPigment = mix(wetPigment, wetPigment * creamPaperWash, creamFactor);
    }

    // Vibrance saturation adjustment
    vec3 gray = vec3(lum);
    wetPigment = mix(gray, wetPigment, 1.0 + (u_vibrance - 1.0) * 0.5);

    // -------------------------------------------------------------
    // 5. Cold-Press Watercolor Paper Grain & Granulation
    // -------------------------------------------------------------
    vec3 paperSample = texture(u_paperTexture, uv * 4.0).rgb;
    float grainVal = luma(paperSample);

    // Granulation: pigment settling in crevices (troughs absorb more pigment, ridges reflect cream light)
    float granulation = (grainVal - 0.5) * 0.28 * u_paperGrain;
    vec3 finalColor = wetPigment + granulation;

    // Paper grain multiply blend
    vec3 paperMultiply = mix(vec3(1.0), paperSample, 0.18 * u_paperGrain);
    finalColor *= paperMultiply;

    // Very soft organic border vignette
    vec2 cuv = v_uv - 0.5;
    float vig = 1.0 - dot(cuv, cuv) * 0.26;
    finalColor *= vig;

    fragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
}
