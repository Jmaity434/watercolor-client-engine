# Watercolor Client Engine 🎨

**Non-AI, 100% browser-side vibrant watercolor painting style for video and images.**

Live Demo: https://jmaity434.github.io/watercolor-client-engine/

A high-performance WebGL2 shader pipeline delivering an authentic artistic watercolor look with soft brushstrokes, bleeding deep reds, glowing yellows, warm cream highlights, and textured cold-press paper granulation.

> **Zero AI Models · Zero Backend · 100% Client-Side WebGL2 · 60 FPS Real-Time**

---

## What It Does

| Input | Output |
|---|---|
| Any video or image (any resolution / aspect ratio) | Real-time hand-painted vibrant watercolor animation |
| Live video player / AR tracked photo video | Smooth real-time watercolor overlay layer |
| Webcam / Camera stream | Real-time stylized artistic portrait / landscape feed |

---

## Mathematical Shader Pipeline (Pure GPU Math)

1. **Soft Brushstrokes (Kuwahara Filtering):**
   Divides local pixel neighborhoods into 4 directional lobes and gathers the sector with the lowest color variance. Removes digital artifacts while generating painterly brush washes.
2. **Wet-on-Wet Capillary Bleed:**
   Simulates wet paint bleeding outward from edges into adjacent areas. Deep reds, vermillions, and sunny cadmiums diffuse naturally with organic fluid gradients.
3. **Coffee-Ring Edge Darkening:**
   Simulates the physics of water evaporation depositing denser pigment along drying wash borders.
4. **Vibrant Palette Grading:**
   - Bleeding deep crimson & cadmium reds
   - Radiant golden yellows & ochres
   - Soft cream and eggshell parchment highlights (no harsh digital clipped whites)
5. **Cold-Press Paper Granulation:**
   Procedural organic paper grain where pigment pools naturally into surface troughs and ridges reflect warm cream light.

---

## Quick Start (Any Web Stack)

```bash
git clone https://github.com/Jmaity434/watercolor-client-engine.git
```

### 1. Basic HTML Setup

```html
<canvas id="out"></canvas>
<video id="src" src="video.mp4" playsinline loop muted></video>

<script type="module">
  import { WatercolorEngine } from './src/watercolor.js';

  const video = document.getElementById('src');
  const canvas = document.getElementById('out');

  const engine = new WatercolorEngine(canvas, {
    bleed: 0.65,        // Pigment bleed & wetness (0 - 1)
    brushSize: 0.50,    // Soft brushstroke scale (0 - 1)
    paperGrain: 0.55,   // Paper texture intensity (0 - 1)
    vibrance: 1.15,     // Saturation & color pop (0.5 - 1.5)
    edgeDarken: 0.45,   // Pigment edge accumulation (0 - 1)
    fit: 'contain'      // 'contain' | 'cover' | 'fill'
  });

  // Attach directly to the video element
  await engine.attachVideo(video);
  engine.start();
</script>
```

### 2. Overlay On Existing AR / Video Players

```js
import { WatercolorEngine } from './src/watercolor.js';

const existingVideo = document.getElementById('my-ar-video');
const overlayCanvas = document.getElementById('watercolor-overlay');

const engine = new WatercolorEngine(overlayCanvas, { fit: 'contain' });
await engine.attachVideo(existingVideo);
engine.start();

// Export with audio preserved
const stream = engine.captureStream(30, true);
```

---

## API Reference

### Constructor Options

| Option | Type | Default | Description |
|---|---|---|---|
| `bleed` | number | `0.65` | Amount of capillary pigment bleed & wetness (0.0 to 1.0) |
| `brushSize` | number | `0.50` | Brush stroke softness & radius (0.0 to 1.0) |
| `paperGrain` | number | `0.55` | Cold-press paper granulation strength (0.0 to 1.0) |
| `vibrance` | number | `1.15` | Color vibrance & rich pigment saturation (0.5 to 1.5) |
| `edgeDarken` | number | `0.45` | Water boundary / coffee-ring accumulation (0.0 to 1.0) |
| `fit` | string | `'contain'` | Aspect ratio fit mode: `'contain'`, `'cover'`, `'fill'` |

### Methods

| Method | Description |
|---|---|
| `loadSource(source)` | Load `HTMLVideoElement`, `HTMLImageElement`, `HTMLCanvasElement`, `MediaStream`, or `File` |
| `attachVideo(video)` | Bind directly to playing video element |
| `start()` / `startRenderLoop()` | Start real-time rendering loop |
| `stop()` / `stopEngine()` | Stop rendering loop |
| `drawFrame(time?)` | Render a single frame on demand (scrubbing/thumbnails) |
| `setOptions(opts)` | Update parameters dynamically in real time |
| `captureStream(fps?, audio?)` | Export `MediaStream` with original audio track merged |
| `toBlob(type?, quality?)` | Export frame snapshot as Blob |
| `destroy()` | Clean up all WebGL textures, buffers, and event listeners |

---

## Project Structure

```
watercolor-client-engine/
├── src/
│   ├── watercolor.js        # Core WebGL2 engine & shader pipeline
│   ├── record-engine.js     # Multi-browser WebM/MP4 recorder wrapper
│   └── shaders/
│       ├── vertex.vert      # Quad vertex shader
│       └── watercolor.frag  # Pure GPU watercolor simulation
├── index.html               # Interactive demo & documentation
├── package.json             # ES Module definitions
└── README.md                # Documentation (English & Bengali)
```

---

## License

MIT License — free for personal and commercial use.
