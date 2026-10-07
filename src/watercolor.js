/**
 * Watercolor Client Engine
 * Pure WebGL2 · Zero AI · Zero Dependency · Real-Time Browser-Native Video & Image Filter
 *
 * Vibrant watercolor painting style with soft brushstrokes, bleeding deep reds,
 * radiant yellows, warm creams, and textured cold-press paper granulation.
 *
 * MIT License
 */

const DEFAULT_VS = `#version 300 es
in vec2 position;
out vec2 v_uv;

void main() {
    v_uv = position * 0.5 + 0.5;
    v_uv.y = 1.0 - v_uv.y; // Standard video texture coordinates
    gl_Position = vec4(position, 0.0, 1.0);
}`;

const DEFAULT_FS = `#version 300 es
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

float luma(vec3 c) {
    return dot(c, vec3(0.299, 0.587, 0.114));
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

    vec4 qBounds[4] = vec4[](
        vec4(-1.0, 0.0, -1.0, 0.0),
        vec4( 0.0, 1.0, -1.0, 0.0),
        vec4(-1.0, 0.0,  0.0, 1.0),
        vec4( 0.0, 1.0,  0.0, 1.0)
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

    const vec2 bleedDirs[8] = vec2[](
        vec2( 1.0,  0.0), vec2(-1.0,  0.0),
        vec2( 0.0,  1.0), vec2( 0.0, -1.0),
        vec2( 0.7,  0.7), vec2(-0.7,  0.7),
        vec2( 0.7, -0.7), vec2(-0.7, -0.7)
    );

    for (int i = 0; i < 8; i++) {
        vec2 bUv = clamp(uv + bleedDirs[i] * bleedDist * texel, 0.0, 1.0);
        vec3 neighbor = texture(u_video, bUv).rgb;

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

    vec3 ringColor = wetPigment * vec3(0.72, 0.65, 0.60);
    wetPigment = mix(wetPigment, ringColor, edgeMask * 0.42);

    // -------------------------------------------------------------
    // 4. Vibrant Palette Tuning: Bleeding Deep Reds, Rich Yellows, & Soft Creams
    // -------------------------------------------------------------
    float redDominance = max(0.0, wetPigment.r - max(wetPigment.g, wetPigment.b));
    wetPigment.r += redDominance * 0.22 * u_vibrance;
    wetPigment.g += redDominance * 0.04 * u_vibrance;

    float yellowTone = min(wetPigment.r, wetPigment.g) * (1.0 - wetPigment.b);
    wetPigment.r += yellowTone * 0.14 * u_vibrance;
    wetPigment.g += yellowTone * 0.12 * u_vibrance;
    wetPigment.b *= mix(1.0, 0.90, u_vibrance);

    float lum = luma(wetPigment);
    vec3 creamPaperWash = vec3(1.02, 0.97, 0.90);
    if (lum > 0.65) {
        float creamFactor = smoothstep(0.65, 1.0, lum) * 0.35;
        wetPigment = mix(wetPigment, wetPigment * creamPaperWash, creamFactor);
    }

    vec3 gray = vec3(lum);
    wetPigment = mix(gray, wetPigment, 1.0 + (u_vibrance - 1.0) * 0.5);

    // -------------------------------------------------------------
    // 5. Cold-Press Watercolor Paper Grain & Granulation
    // -------------------------------------------------------------
    vec3 paperSample = texture(u_paperTexture, uv * 4.0).rgb;
    float grainVal = luma(paperSample);

    float granulation = (grainVal - 0.5) * 0.28 * u_paperGrain;
    vec3 finalColor = wetPigment + granulation;

    vec3 paperMultiply = mix(vec3(1.0), paperSample, 0.18 * u_paperGrain);
    finalColor *= paperMultiply;

    vec2 cuv = v_uv - 0.5;
    float vig = 1.0 - dot(cuv, cuv) * 0.26;
    finalColor *= vig;

    fragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
}`;

export class WatercolorEngine {
    /**
     * @param {HTMLCanvasElement} canvasElement
     * @param {Object} [config={}]
     * @param {number} [config.bleed=0.65]        Amount of pigment bleeding & wetness (0 - 1)
     * @param {number} [config.brushSize=0.50]    Soft brush stroke scale (0 - 1)
     * @param {number} [config.paperGrain=0.55]   Watercolor paper texture intensity (0 - 1)
     * @param {number} [config.vibrance=1.15]     Color saturation & pigment pop (0 - 1.5)
     * @param {number} [config.edgeDarken=0.45]   Coffee-ring edge darkening (0 - 1)
     * @param {string} [config.fit='contain']     'contain' | 'cover' | 'fill'
     */
    constructor(canvasElement, config = {}) {
        if (!canvasElement) {
            throw new Error('WatercolorEngine requires a target HTMLCanvasElement');
        }
        this.canvas = canvasElement;
        this.gl = this.canvas.getContext('webgl2', {
            alpha: false,
            antialias: false,
            preserveDrawingBuffer: true,
            powerPreference: 'high-performance',
            desynchronized: true,
        });

        if (!this.gl) {
            throw new Error('WebGL2 is required for WatercolorEngine');
        }

        this.options = {
            bleed:      config.bleed      ?? 0.65,
            brushSize:  config.brushSize  ?? 0.50,
            paperGrain: config.paperGrain ?? 0.55,
            vibrance:   config.vibrance   ?? 1.15,
            edgeDarken: config.edgeDarken ?? 0.45,
            fit:        config.fit        ?? 'contain',
        };

        // Internal media element pool
        this._internalVideo = document.createElement('video');
        this._internalVideo.muted = true;
        this._internalVideo.loop = true;
        this._internalVideo.playsInline = true;
        this._internalVideo.crossOrigin = 'anonymous';

        this._internalImage = new Image();
        this._internalImage.crossOrigin = 'anonymous';

        this.activeSource = null;
        this.sourceType = null; // 'video' | 'image' | 'webcam' | 'canvas'

        this.isProcessing = false;
        this.animationFrameId = null;
        this._startTime = 0;
        this._lastW = 0;
        this._lastH = 0;

        this.program = null;
        this.positionBuffer = null;
        this.videoTexture = null;
        this.paperTexture = null;
        this._locations = null;

        this._onContextLost = (e) => {
            e.preventDefault();
            this.stopEngine();
        };
        this._onContextRestored = () => {
            this._initGL();
            if (this.isProcessing) this.startRenderLoop();
        };
        this.canvas.addEventListener('webglcontextlost', this._onContextLost, false);
        this.canvas.addEventListener('webglcontextrestored', this._onContextRestored, false);

        this._initGL();
    }

    async ready() {
        return Promise.resolve();
    }

    _initGL() {
        const gl = this.gl;
        if (!gl) return;

        const vs = this._compileShader(gl.VERTEX_SHADER, DEFAULT_VS);
        const fs = this._compileShader(gl.FRAGMENT_SHADER, DEFAULT_FS);
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);

        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            const log = gl.getProgramInfoLog(prog);
            gl.deleteProgram(prog);
            throw new Error('Watercolor shader link failed: ' + log);
        }
        this.program = prog;

        // Quad geometry
        const verts = new Float32Array([
            -1.0, -1.0,
             1.0, -1.0,
            -1.0,  1.0,
            -1.0,  1.0,
             1.0, -1.0,
             1.0,  1.0,
        ]);
        this.positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

        // Textures
        this.videoTexture = gl.createTexture();
        this._setupTextureParams(this.videoTexture);

        this.paperTexture = gl.createTexture();
        this._setupTextureParams(this.paperTexture);
        this._generateColdPressPaperTexture();

        // Uniform locations
        this._locations = {
            position:     gl.getAttribLocation(prog, 'position'),
            video:        gl.getUniformLocation(prog, 'u_video'),
            paperTexture: gl.getUniformLocation(prog, 'u_paperTexture'),
            resolution:   gl.getUniformLocation(prog, 'u_resolution'),
            time:         gl.getUniformLocation(prog, 'u_time'),
            bleed:        gl.getUniformLocation(prog, 'u_bleed'),
            brushSize:    gl.getUniformLocation(prog, 'u_brushSize'),
            paperGrain:   gl.getUniformLocation(prog, 'u_paperGrain'),
            vibrance:     gl.getUniformLocation(prog, 'u_vibrance'),
            edgeDarken:   gl.getUniformLocation(prog, 'u_edgeDarken'),
            uvScale:      gl.getUniformLocation(prog, 'u_uvScale'),
            uvOffset:     gl.getUniformLocation(prog, 'u_uvOffset'),
            fitMode:      gl.getUniformLocation(prog, 'u_fitMode'),
        };

        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
        gl.disable(gl.CULL_FACE);
    }

    _compileShader(type, src) {
        const gl = this.gl;
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            const log = gl.getShaderInfoLog(s);
            gl.deleteShader(s);
            throw new Error('Shader compilation error: ' + log);
        }
        return s;
    }

    _setupTextureParams(tex) {
        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }

    /**
     * Procedural Cold-Press Watercolor Paper grain (256x256)
     */
    _generateColdPressPaperTexture() {
        const gl = this.gl;
        const size = 256;
        const data = new Uint8Array(size * size * 4);

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const idx = (y * size + x) * 4;
                const f1 = Math.sin(x * 0.15) * Math.cos(y * 0.18);
                const f2 = Math.sin(x * 0.50 + y * 0.40);
                const noise = (Math.random() - 0.5) * 24.0;
                const base = Math.max(170, Math.min(250, Math.floor(218 + (f1 + f2) * 11 + noise)));

                data[idx]     = Math.min(255, base + 10);  // Warm red-cream
                data[idx + 1] = base;                      // Green
                data[idx + 2] = Math.max(150, base - 16);  // Slight yellow tint
                data[idx + 3] = 255;
            }
        }
        gl.bindTexture(gl.TEXTURE_2D, this.paperTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    }

    /**
     * Load source from HTMLVideoElement, HTMLImageElement, HTMLCanvasElement, MediaStream, File, Blob, or URL string
     */
    async loadSource(source) {
        if (typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement) {
            return this.attachVideo(source);
        }
        if (typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement) {
            return this.attachImage(source);
        }
        if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) {
            return this.attachCanvas(source);
        }
        if (typeof MediaStream !== 'undefined' && source instanceof MediaStream) {
            return this.attachStream(source);
        }

        const isFile = source instanceof File || source instanceof Blob;
        const mime = isFile ? (source.type || '') : '';
        const name = isFile && source.name ? source.name.toLowerCase() : '';

        const looksImage =
            mime.startsWith('image/') ||
            /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(name) ||
            (!isFile && /\.(jpe?g|png|webp|gif|bmp|avif)(\?|$)/i.test(String(source)));

        if (looksImage) {
            return this.loadSourceImage(source);
        }
        return this.loadSourceVideo(source);
    }

    attachVideo(videoElement) {
        this.stopEngine();
        this.activeSource = videoElement;
        this.sourceType = 'video';

        const updateDims = () => {
            const w = videoElement.videoWidth || videoElement.clientWidth || 640;
            const h = videoElement.videoHeight || videoElement.clientHeight || 360;
            this.syncCanvasSize(w, h);
            return { width: w, height: h, type: 'video' };
        };

        if (videoElement.readyState >= 2 && videoElement.videoWidth) {
            return Promise.resolve(updateDims());
        }

        return new Promise((resolve) => {
            const onLoaded = () => {
                videoElement.removeEventListener('loadeddata', onLoaded);
                resolve(updateDims());
            };
            videoElement.addEventListener('loadeddata', onLoaded);
            setTimeout(() => resolve(updateDims()), 500);
        });
    }

    attachImage(imageElement) {
        this.stopEngine();
        this.activeSource = imageElement;
        this.sourceType = 'image';

        const w = imageElement.naturalWidth || imageElement.width || 640;
        const h = imageElement.naturalHeight || imageElement.height || 480;
        this.syncCanvasSize(w, h);
        return Promise.resolve({ width: w, height: h, type: 'image' });
    }

    attachCanvas(canvasElement) {
        this.stopEngine();
        this.activeSource = canvasElement;
        this.sourceType = 'canvas';

        const w = canvasElement.width || 640;
        const h = canvasElement.height || 480;
        this.syncCanvasSize(w, h);
        return Promise.resolve({ width: w, height: h, type: 'canvas' });
    }

    async attachStream(stream) {
        this.stopEngine();
        this.sourceType = 'webcam';
        this.activeSource = this._internalVideo;
        this._internalVideo.srcObject = stream;
        await this._internalVideo.play().catch(() => {});

        const w = this._internalVideo.videoWidth || 640;
        const h = this._internalVideo.videoHeight || 480;
        this.syncCanvasSize(w, h);
        return { width: w, height: h, type: 'webcam' };
    }

    loadSourceImage(fileOrUrl) {
        return new Promise((resolve, reject) => {
            this.stopEngine();
            this.sourceType = 'image';
            this.activeSource = this._internalImage;

            this._internalImage = new Image();
            this._internalImage.crossOrigin = 'anonymous';
            this.activeSource = this._internalImage;

            const url = (fileOrUrl instanceof File || fileOrUrl instanceof Blob)
                ? URL.createObjectURL(fileOrUrl)
                : fileOrUrl;

            this._internalImage.onload = async () => {
                try {
                    if (this._internalImage.decode) await this._internalImage.decode();
                } catch (_) {}

                const w = this._internalImage.naturalWidth || this._internalImage.width;
                const h = this._internalImage.naturalHeight || this._internalImage.height;
                if (!w || !h) {
                    reject(new Error('Image has zero dimensions'));
                    return;
                }
                this.syncCanvasSize(w, h);
                resolve({ width: w, height: h, type: 'image' });
            };
            this._internalImage.onerror = () => reject(new Error('Image load failed'));
            this._internalImage.src = url;
        });
    }

    loadSourceVideo(fileOrUrl) {
        return new Promise((resolve, reject) => {
            this.stopEngine();
            this.sourceType = 'video';
            this.activeSource = this._internalVideo;

            if (this._internalVideo.srcObject) {
                this._internalVideo.srcObject.getTracks().forEach(t => t.stop());
                this._internalVideo.srcObject = null;
            }

            if (fileOrUrl instanceof File || fileOrUrl instanceof Blob) {
                this._internalVideo.src = URL.createObjectURL(fileOrUrl);
            } else {
                this._internalVideo.src = fileOrUrl;
            }

            this._internalVideo.onloadeddata = () => {
                const w = this._internalVideo.videoWidth;
                const h = this._internalVideo.videoHeight;
                if (!w || !h) {
                    reject(new Error('Video has zero dimensions'));
                    return;
                }
                this.syncCanvasSize(w, h);
                resolve({ width: w, height: h, type: 'video' });
            };
            this._internalVideo.onerror = () => reject(new Error('Video load failed'));
        });
    }

    syncCanvasSize(srcW, srcH) {
        const dpr = Math.min(typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1, 2);
        const w = this.canvas.clientWidth ? Math.round(this.canvas.clientWidth * dpr) : (srcW || this.canvas.width || 640);
        const h = this.canvas.clientHeight ? Math.round(this.canvas.clientHeight * dpr) : (srcH || this.canvas.height || 360);

        if (this.canvas.width !== w || this.canvas.height !== h) {
            this.canvas.width = Math.max(1, w);
            this.canvas.height = Math.max(1, h);
            this._lastW = this.canvas.width;
            this._lastH = this.canvas.height;
        }
    }

    getSourceDimensions() {
        const el = this.activeSource;
        if (!el) return { w: this.canvas.width, h: this.canvas.height };
        if (el instanceof HTMLVideoElement) {
            return { w: el.videoWidth || el.clientWidth || 640, h: el.videoHeight || el.clientHeight || 360 };
        }
        if (el instanceof HTMLImageElement) {
            return { w: el.naturalWidth || el.width || 640, h: el.naturalHeight || el.height || 480 };
        }
        if (el instanceof HTMLCanvasElement) {
            return { w: el.width || 640, h: el.height || 480 };
        }
        return { w: this.canvas.width, h: this.canvas.height };
    }

    setOptions(opts) {
        Object.assign(this.options, opts);
        if (!this.isProcessing) this.drawFrame();
    }

    drawFrame(time = performance.now()) {
        if (!this.program || !this.sourceType || !this.activeSource) return;
        const gl = this.gl;
        if (!gl) return;

        const sourceEl = this.activeSource;
        if (this.sourceType === 'image' && (!sourceEl.complete || !sourceEl.naturalWidth)) return;
        if (this.sourceType === 'video' && (sourceEl.readyState < 2 || !sourceEl.videoWidth)) return;

        const { w: srcW, h: srcH } = this.getSourceDimensions();
        const dpr = Math.min(typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1, 2);
        const w = this.canvas.clientWidth ? Math.round(this.canvas.clientWidth * dpr) : this.canvas.width;
        const h = this.canvas.clientHeight ? Math.round(this.canvas.clientHeight * dpr) : this.canvas.height;

        if (w !== this._lastW || h !== this._lastH) {
            this.canvas.width = Math.max(1, w);
            this.canvas.height = Math.max(1, h);
            this._lastW = this.canvas.width;
            this._lastH = this.canvas.height;
        }

        gl.viewport(0, 0, this.canvas.width, this.canvas.height);

        gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
        try {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceEl);
        } catch (_) {
            return;
        }

        gl.useProgram(this.program);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
        gl.uniform1i(this._locations.video, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.paperTexture);
        gl.uniform1i(this._locations.paperTexture, 1);

        // Aspect ratio fit
        const canvasAspect = this.canvas.width / Math.max(1, this.canvas.height);
        const sourceAspect = srcW / Math.max(1, srcH);

        let scaleX = 1.0;
        let scaleY = 1.0;
        let offsetX = 0.0;
        let offsetY = 0.0;
        let fitMode = 0.0; // fill

        if (this.options.fit === 'contain') {
            fitMode = 1.0;
            if (sourceAspect > canvasAspect) {
                scaleY = canvasAspect / sourceAspect;
                offsetY = (1.0 - scaleY) * 0.5;
            } else {
                scaleX = sourceAspect / canvasAspect;
                offsetX = (1.0 - scaleX) * 0.5;
            }
        } else if (this.options.fit === 'cover') {
            fitMode = 2.0;
            if (sourceAspect > canvasAspect) {
                scaleX = canvasAspect / sourceAspect;
                offsetX = (1.0 - scaleX) * 0.5;
            } else {
                scaleY = sourceAspect / canvasAspect;
                offsetY = (1.0 - scaleY) * 0.5;
            }
        }

        const t = (time - this._startTime) * 0.001;
        const opt = this.options;

        gl.uniform2f(this._locations.resolution, this.canvas.width, this.canvas.height);
        gl.uniform1f(this._locations.time, t);
        gl.uniform1f(this._locations.bleed, opt.bleed);
        gl.uniform1f(this._locations.brushSize, opt.brushSize);
        gl.uniform1f(this._locations.paperGrain, opt.paperGrain);
        gl.uniform1f(this._locations.vibrance, opt.vibrance);
        gl.uniform1f(this._locations.edgeDarken, opt.edgeDarken);
        gl.uniform2f(this._locations.uvScale, scaleX, scaleY);
        gl.uniform2f(this._locations.uvOffset, offsetX, offsetY);
        gl.uniform1f(this._locations.fitMode, fitMode);

        gl.enableVertexAttribArray(this._locations.position);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.vertexAttribPointer(this._locations.position, 2, gl.FLOAT, false, 0, 0);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    startRenderLoop() {
        if (this.isProcessing) return;
        if (!this.sourceType || !this.activeSource) return;

        this.isProcessing = true;
        this._startTime = performance.now();

        if (this.sourceType === 'video' || this.sourceType === 'webcam') {
            if (this.activeSource instanceof HTMLVideoElement && this.activeSource.paused) {
                this.activeSource.play().catch(() => {});
            }
        }

        if (this.sourceType === 'image') {
            this.drawFrame();
            this.isProcessing = false;
            return;
        }

        const render = (now) => {
            if (!this.isProcessing) return;
            this.drawFrame(now);
            this.animationFrameId = requestAnimationFrame(render);
        };
        this.animationFrameId = requestAnimationFrame(render);
    }

    start() {
        this.startRenderLoop();
    }

    stopEngine() {
        this.isProcessing = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        if (this._internalVideo) {
            this._internalVideo.pause();
            if (this._internalVideo.srcObject) {
                this._internalVideo.srcObject.getTracks().forEach(t => t.stop());
                this._internalVideo.srcObject = null;
            }
        }
    }

    stop() {
        this.stopEngine();
    }

    processStill() {
        this.drawFrame();
    }

    getCanvas() {
        return this.canvas;
    }

    captureStream(fps = 30, includeAudio = true) {
        const stream = this.canvas.captureStream(fps);
        if (includeAudio && this.activeSource instanceof HTMLVideoElement) {
            try {
                const vidStream = this.activeSource.captureStream ? this.activeSource.captureStream() : null;
                if (vidStream) {
                    vidStream.getAudioTracks().forEach(track => stream.addTrack(track));
                }
            } catch (_) {}
        }
        return stream;
    }

    async toBlob(type = 'image/png', quality = 0.92) {
        this.drawFrame();
        return new Promise((resolve) => this.canvas.toBlob(resolve, type, quality));
    }

    async exportImage(type = 'image/png', quality = 0.92) {
        return this.toBlob(type, quality);
    }

    destroy() {
        this.stopEngine();
        if (this.canvas) {
            this.canvas.removeEventListener('webglcontextlost', this._onContextLost, false);
            this.canvas.removeEventListener('webglcontextrestored', this._onContextRestored, false);
        }
        const gl = this.gl;
        if (gl) {
            if (this.videoTexture) gl.deleteTexture(this.videoTexture);
            if (this.paperTexture) gl.deleteTexture(this.paperTexture);
            if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer);
            if (this.program) gl.deleteProgram(this.program);
        }
        this.gl = null;
        this.program = null;
        this.positionBuffer = null;
        this.videoTexture = null;
        this.paperTexture = null;
        this.activeSource = null;
    }
}

// Aliases for unified ecosystem compatibility
export const WatercolorLayer = WatercolorEngine;
export function createWatercolorEngine(canvas, config) {
    return new WatercolorEngine(canvas, config);
}

export default WatercolorEngine;
