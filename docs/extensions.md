# Creating Extension Packages

Agent Terrarium supports custom extension packages — declarative JSON files that add new **themes**, **avatars**, and/or **gear** to the terrarium. No source code or build tools needed.

## Quick Start

1. Create a `.json` file in your user packages folder:
   - **Windows:** `%USERPROFILE%\agent-terrarium\packages\`
   - **macOS/Linux:** `~/agent-terrarium/packages/`
2. Use the package format described below
3. Restart Agent Terrarium — your content appears automatically (or it hot-reloads if the app is already running)

Packages are forward-compatible: unknown layer types, decorator names, or gear shapes are silently skipped, so packages made for newer versions degrade gracefully on older ones.

## Package Structure

Every package is a single JSON file:

```json
{
  "version": 1,
  "name": "My Awesome Pack",
  "author": "Your Name",
  "themes": [ ... ],
  "agents": [ ... ],
  "gear":   [ ... ]
}
```

All three arrays are optional — include only what your package provides. A single package can contain a mix of themes, avatars, and gear.

---

## Creating an Avatar

Avatars are the characters that live in the terrarium. Each avatar is drawn entirely from a `drawSpec` — an ordered list of visual layers rendered back-to-front.

### Minimal Example

```json
{
  "id": "penguin",
  "name": "Penguin",
  "icon": "🐧",
  "shape": "penguin",
  "voice": {
    "basePitch": 400,
    "pitchVar": 100,
    "wave": "triangle",
    "syllables": 3,
    "speed": 0.07,
    "volume": 0.1
  },
  "personality": {
    "speedMin": 20,
    "speedMax": 70,
    "movementStyle": "wander",
    "interactionChance": 0.6,
    "ballInterest": 0.7,
    "chatEmojis": ["🐧", "❄️", "🐟", "😊", "🧊"]
  },
  "drawSpec": {
    "waddleAmount": 4,
    "layers": [
      { "type": "legs", "color": "#FF8F00", "spread": 5, "length": 6, "footStyle": "flat", "footRx": 5 },
      { "type": "body", "color": "#263238", "rx": 11, "ry": 12 },
      { "type": "patch", "position": "belly", "color": "#ECEFF1", "rx": 7, "ry": 9 },
      { "type": "head", "color": "#263238", "rx": 10, "ry": 10 },
      { "type": "eyes", "style": "standard", "color": "#333", "size": 2.5 },
      { "type": "beak", "color": "#FF8F00" },
      { "type": "cheeks", "color": "#FFAB91" }
    ]
  }
}
```

### Voice Profile

Controls both the Animalese-style greeting sound (when an agent first appears or is interacted with) **and** the text-to-speech voice (when agents speak via the awareness system):

| Field          | Type   | Description                           |
|----------------|--------|---------------------------------------|
| `basePitch`    | number | Base frequency in Hz (200–1000). Also controls TTS defaults: lower → deeper/slower, higher → squeakier/faster |
| `pitchVar`     | number | Random pitch variation in Hz (Animalese only) |
| `wave`         | string | `"sine"`, `"triangle"`, `"square"`, `"sawtooth"` (Animalese only) |
| `syllables`    | number | Number of syllables per greeting (Animalese only) |
| `speed`        | number | Speed of each syllable, lower=slower (Animalese only) |
| `volume`       | number | Volume 0–1 (Animalese only)           |
| `ttsRate`      | number | *(optional)* SAPI speech rate override (−10 to +10). Auto-derived from `basePitch` if omitted |
| `ttsPitchShift`| number | *(optional)* Playback rate multiplier override (0.5–3.0). Auto-derived from `basePitch` if omitted |

**TTS behavior:** When an agent has TTS enabled and speaks via the awareness system, `basePitch` determines two properties:
- **SAPI speech rate** — mapped from slow (−3) to fast (+4), controlling cadence
- **Pitch shift** — mapped from deep (0.85×) to chipmunk (2.0×) via audio playback rate

A different system voice (male/female) is automatically assigned per agent for additional variety.

### Personality

Controls movement behavior and social interactions:

| Field              | Type     | Description                                    |
|--------------------|----------|------------------------------------------------|
| `speedMin`         | number   | Minimum movement speed (px/s)                  |
| `speedMax`         | number   | Maximum movement speed (px/s)                  |
| `movementStyle`    | string   | `"wander"`, `"patrol"`, `"bounce"`, `"float"` |
| `interactionChance`| number   | 0–1, chance of social interaction when passing |
| `ballInterest`     | number   | 0–1, how eagerly the agent chases thrown balls |
| `chatEmojis`       | string[] | Emojis used in social interaction bubbles      |

### DrawSpec Layers

Layers are drawn in order (first = back, last = front). Available layer types:

#### `legs` — Walking legs
```json
{ "type": "legs", "color": "#333", "spread": 5, "length": 8, "footStyle": "round" }
```
- `footStyle`: `"round"` (default) or `"flat"` (penguin-like)
- `footRx`: foot width for flat feet (default: 5)

#### `body` — Main body ellipse
```json
{ "type": "body", "color": "#FF9800", "rx": 10, "ry": 10 }
```

#### `head` — Head ellipse (positioned above body)
```json
{ "type": "head", "color": "#FFB74D", "rx": 11, "ry": 10 }
```

#### `ears` — Ear shapes on top of head
```json
{ "type": "ears", "style": "pointed", "color": "#FFB74D", "size": 11, "innerColor": "#FFAB91" }
```
- `style`: `"pointed"` (cat/fox), `"round"` (bear/dog), `"comb"` (chicken)

#### `eyes` — Eyes with automatic blinking
```json
{ "type": "eyes", "style": "standard", "color": "#333", "size": 2.5 }
```
- `style`: `"standard"` (simple dots with blink) or `"custom"` (iris + pupil)
- `spacing`: distance between eyes (default: 4)
- `pupilColor`: for custom style

#### `mouth` — Mouth expression
```json
{ "type": "mouth", "style": "smile" }
```
- `style`: `"smile"`, `"small"`, `"o"`, `"w"` (cat mouth)
- `movingStyle`: different expression when the agent is walking

#### `cheeks` — Blush circles on cheeks
```json
{ "type": "cheeks", "color": "#FF8A80" }
```

#### `nose` — Small nose
```json
{ "type": "nose", "color": "#5D4037", "rx": 2, "ry": 1.5 }
```

#### `beak` — Bird beak (triangle below eyes)
```json
{ "type": "beak", "color": "#FF8F00" }
```

#### `whiskers` — Cat whiskers
```json
{ "type": "whiskers", "count": 3, "length": 10 }
```

#### `tail` — Animated tail
```json
{ "type": "tail", "color": "#E65100", "tailStyle": "thin", "swaySpeed": 200, "swayAmount": 6 }
```
- `tailStyle`: `"thin"` (cat) or `"fluffy"` (fox/squirrel)
- `highlightColor`: lighter tip color for fluffy tails

#### `wings` — Animated wings
```json
{ "type": "wings", "wingStyle": "flutter", "color": "rgba(200,230,255,0.3)", "speed": 250 }
```
- `wingStyle`: `"flutter"` (fairy/bee) or `"flap"` (bird/chicken)

#### `patch` — Colored patch on belly or face
```json
{ "type": "patch", "position": "belly", "color": "#FFF3E0", "rx": 6, "ry": 7 }
```

#### `glow` — Pulsing radial glow behind the agent
```json
{ "type": "glow", "color": "rgba(255,215,0,0.1)", "radius": 16, "pulseSpeed": 600 }
```

#### `sparkles` — Animated sparkle effects
```json
{ "type": "sparkles", "sparkleStyle": "orbit", "color": "#64B5F6", "count": 3, "speed": 300 }
```
- `sparkleStyle`: `"star"` (above head), `"orbit"` (circling), `"floating"` (drifting up)

#### `visor` — Robot/tech visor with scan line
```json
{ "type": "visor", "bandColor": "#37474F", "glowColors": ["#00BCD4", "#2196F3", "#00BCD4"], "scan": true }
```

#### `ghostBody` — Wavy ghost body (replaces body+legs)
```json
{ "type": "ghostBody", "color": "#E8EAF6", "waves": 5, "waveHeight": 6, "shimmer": true }
```
Use with `"movement": "float"` in the drawSpec.

#### `accessory` — Extra visual elements
```json
{ "type": "accessory", "accessoryKind": "scarf", "color": "#E53935" }
```
- `accessoryKind`: `"scarf"`, `"idle-prop"` (shown only when idle), `"rider"` (small figure on top)
- Rider-specific: `riderColor`, `helmetColor`, `swordColor`

### DrawSpec Options

| Field          | Type   | Default  | Description                            |
|----------------|--------|----------|----------------------------------------|
| `movement`     | string | `"walk"` | `"walk"` (uses legs) or `"float"` (bobs in air) |
| `waddleAmount` | number | `0`      | Body rotation angle when walking (degrees) |

### Default Backend Configuration

You can bundle a default AI backend configuration with an avatar:

```json
"defaultBackend": {
  "backend_id": "copilot",
  "model": "gpt-4o",
  "system_prompt": "You are a cheerful penguin who loves fish.",
  "awareness_level": 1
}
```

---

## Creating a Theme

Themes control the entire background scene: sky, ground, decorators, particles, and music.

### Minimal Example

```json
{
  "id": "my_theme",
  "name": "My Theme",
  "icon": "🎨",
  "sky": ["#87CEEB", "#E8F5E9"],
  "ground": "#7CB342",
  "groundAccent": "#689F38",
  "decorators": ["clouds", "grass"]
}
```

### Theme Fields

| Field             | Type     | Required | Description                                |
|-------------------|----------|----------|--------------------------------------------|
| `id`              | string   | ✅       | Unique identifier (snake_case)             |
| `name`            | string   | ✅       | Display name shown in the theme menu       |
| `icon`            | string   | ✅       | Emoji icon for the menu                    |
| `sky`             | string[] | ✅       | Sky gradient colors (top → bottom, ≥2)     |
| `ground`          | string   | ✅       | Ground fill color                          |
| `groundAccent`    | string   | ✅       | Ground gradient bottom color               |
| `decorators`      | string[] | ✅       | Ordered list of decorator names to draw    |
| `groundWave`      | number   | —        | Ground wave amplitude in px (default: 4)   |
| `hideGround`      | boolean  | —        | Skip ground rendering entirely (e.g. space)|
| `grass`           | object   | —        | `{ color, accent }` for grass tufts        |
| `particles`       | object   | —        | `{ type, color, count }` ambient particles |
| `music`           | object   | —        | Lofi 8-bit music configuration             |
| `disableDynamicSky` | boolean | —       | Disable weather/time-of-day effects        |
| `customDecorators` | array   | —        | Custom SVG decorators (see below)          |

### Available Decorators

| Name             | Description                                    |
|------------------|------------------------------------------------|
| `clouds`         | Drifting white clouds                          |
| `moon`           | Crescent moon (upper right)                    |
| `stars`          | Twinkling star field                           |
| `shooting_stars` | Occasional shooting stars                      |
| `waves`          | Animated ocean waves                           |
| `seaweed`        | Swaying seaweed plants                         |
| `flowers`        | Colorful flowers along the ground              |
| `grass`          | Grass tufts (requires `grass` theme field)     |
| `cactus`         | Desert cacti                                   |
| `trees`          | Simple pixel trees                             |
| `mist`           | Low-lying mist/fog                             |
| `fireflies`      | Glowing firefly particles                      |
| `castle_walls`   | Medieval castle wall foreground                |
| `torches`        | Flickering wall torches                        |
| `banners`        | Hanging castle banners                         |
| `nebula`         | Colorful nebula clouds (space)                 |
| `planets`        | Distant planets with rings (space)             |
| `space_dust`     | Drifting cosmic dust particles (space)         |
| `distant_star`   | Large cropped sun/star at edge (space)         |
| `galaxy`         | Distant spiral galaxy (space)                  |

Decorators are drawn in the order listed. Unknown names are silently skipped.

### Custom Decorators

For themes that need unique visuals beyond the built-in decorators, you can define custom decorators with inline SVG paths or external SVG/PNG files:

```json
"customDecorators": [
  {
    "name": "my_mountain",
    "file": "mountain.svg",
    "fileX": 0.1,
    "fileY": 0.5,
    "fileWidth": 0.3,
    "fileHeight": 0.25
  },
  {
    "name": "my_bird",
    "elements": [
      { "type": "path", "d": "M0 5 Q5 0 10 5 Q15 0 20 5", "fill": "none", "stroke": "#333", "strokeWidth": 2 }
    ],
    "animation": {
      "type": "waypoint",
      "waypoints": [
        { "x": 0.1, "y": 0.2 },
        { "x": 0.9, "y": 0.3 }
      ],
      "speed": 30
    }
  }
]
```

Custom decorators are referenced in the `decorators` array by their `name`, just like built-in ones. External files are resolved relative to the package directory.

**Positioning**: `fileX`, `fileY` are fractions of canvas size (0–1). `fileY = 0.72` aligns with the ground line. `fileWidth`/`fileHeight` scale relative to a 1280px baseline.

**Animation types**:
- `waypoint` — moves along a list of waypoint positions in a loop
- `jump` — parabolic arc between two points (with gravity)

### Particle Types

| Type     | Description               |
|----------|---------------------------|
| `leaf`   | Falling/drifting leaves    |
| `star`   | Twinkling star particles   |
| `sand`   | Blowing sand grains        |
| `bubble` | Rising bubbles (underwater)|

### Music Configuration

Each theme can define procedural 8-bit lofi music, synthesized in real-time via the Web Audio API:

```json
"music": {
  "bpm": 88,
  "key": 60,
  "scale": [0, 2, 4, 7, 9],
  "wave": "triangle",
  "bassWave": "sine",
  "volume": 0.12,
  "chords": [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]]
}
```

| Field      | Type       | Description                                     |
|------------|------------|-------------------------------------------------|
| `bpm`      | number     | Tempo in beats per minute                       |
| `key`      | number     | Root note as MIDI number (60 = C4)              |
| `scale`    | number[]   | Scale intervals (e.g. major pentatonic: `[0,2,4,7,9]`) |
| `wave`     | string     | Melody waveform: `sine`, `triangle`, `square`, `sawtooth` |
| `bassWave` | string     | Bass waveform                                   |
| `volume`   | number     | Overall volume 0–1                              |
| `chords`   | number[][] | Chord progression as semitone offsets from key   |

---

## Creating Gear

Gear items are equippable accessories that agents can wear. They attach to specific body slots.

### Example

```json
{
  "id": "pirate-hat",
  "name": "Pirate Hat",
  "icon": "🏴‍☠️",
  "slot": "hat",
  "shape": "top-hat",
  "color": "#1A1A1A",
  "accentColor": "#FFD700"
}
```

### Gear Fields

| Field          | Type   | Required | Description                                 |
|----------------|--------|----------|---------------------------------------------|
| `id`           | string | ✅       | Unique identifier (kebab-case)              |
| `name`         | string | ✅       | Display name                                |
| `icon`         | string | ✅       | Emoji icon for menus                        |
| `slot`         | string | ✅       | Where it's worn (see slots below)           |
| `shape`        | string | ✅       | Built-in shape primitive name               |
| `color`        | string | ✅       | Primary color                               |
| `accentColor`  | string | —        | Secondary/accent color                      |
| `image`        | string | —        | URL to SVG/PNG image (overrides shape)      |
| `imageWidth`   | number | —        | Image width in px                           |
| `imageHeight`  | number | —        | Image height in px                          |
| `imageOffsetY` | number | —        | Vertical offset (negative = up)             |

### Gear Slots

| Slot   | Anchor Position      |
|--------|----------------------|
| `hat`  | Top of head          |
| `face` | Eye level            |
| `neck` | Below head           |
| `body` | Center of body       |
| `back` | Behind the agent     |

### Available Gear Shapes

| Shape          | Slot | Description            |
|----------------|------|------------------------|
| `top-hat`      | hat  | Classic tall top hat   |
| `party-hat`    | hat  | Cone with stripes      |
| `crown`        | hat  | Royal crown            |
| `wizard-hat`   | hat  | Tall pointed wizard hat|
| `flower-crown` | hat  | Flower wreath          |
| `bow-tie`      | neck | Bow tie                |
| `scarf`        | neck | Knitted scarf          |
| `sunglasses`   | face | Cool sunglasses        |
| `cape`         | body | Flowing cape           |
| `sweater`      | body | Cozy sweater           |

Using the `image` field, you can render custom gear from any SVG or PNG file instead of using a built-in shape.

---

## Package Location

Drop your `.json` package files into the user packages folder:

- **Windows:** `%USERPROFILE%\agent-terrarium\packages\`
- **macOS/Linux:** `~/agent-terrarium/packages/`

Create the folder if it doesn't exist. You can have multiple package files — each is loaded independently. If your package defines an ID that conflicts with a built-in one, your version takes precedence.

**Hot-reload**: The app watches the packages folder for changes. New or modified packages are picked up automatically without restarting.

**Subdirectories**: Packages with custom assets (SVGs, PNGs) can be organized in subdirectories. Place the JSON file and its assets in a folder, and reference assets by relative path.

## Tips

- **Colors** use CSS hex strings (`"#FF9800"`) or `rgba()` for transparency
- **Test iteratively** — change values, restart, see results
- **Layer order matters** — draw tail and legs first, then body, then head, then face features
- **Use `waddleAmount`** for cute walking animations (2–5 degrees works well)
- **Combine layers creatively** — glow + sparkles + body makes magical creatures; ghostBody + float makes ethereal beings
- **Unknown names are safe** — if you reference a decorator or shape that doesn't exist yet, it's silently skipped

## Complete Package Example

Here's a full package with a theme, an avatar, and a gear item:

```json
{
  "version": 1,
  "name": "Arctic Pack",
  "author": "Your Name",
  "themes": [
    {
      "id": "arctic",
      "name": "Arctic",
      "icon": "🧊",
      "sky": ["#B3E5FC", "#E1F5FE", "#FFFFFF"],
      "ground": "#E0E0E0",
      "groundAccent": "#BDBDBD",
      "groundWave": 2,
      "particles": { "type": "star", "color": "#E3F2FD", "count": 20 },
      "decorators": ["clouds"],
      "music": {
        "bpm": 70,
        "key": 64,
        "scale": [0, 2, 4, 7, 9],
        "wave": "sine",
        "bassWave": "sine",
        "volume": 0.08,
        "chords": [[0, 4, 7], [5, 9, 12]]
      }
    }
  ],
  "agents": [
    {
      "id": "seal",
      "name": "Seal",
      "icon": "🦭",
      "shape": "seal",
      "voice": {
        "basePitch": 350,
        "pitchVar": 80,
        "wave": "sine",
        "syllables": 2,
        "speed": 0.08,
        "volume": 0.1
      },
      "personality": {
        "speedMin": 15,
        "speedMax": 50,
        "movementStyle": "float",
        "interactionChance": 0.8,
        "ballInterest": 0.9,
        "chatEmojis": ["🦭", "🐟", "💙", "🌊", "😊"]
      },
      "drawSpec": {
        "movement": "float",
        "layers": [
          { "type": "glow", "color": "rgba(200,230,255,0.08)", "radius": 18 },
          { "type": "body", "color": "#78909C", "rx": 13, "ry": 10 },
          { "type": "patch", "position": "belly", "color": "#CFD8DC", "rx": 9, "ry": 7 },
          { "type": "head", "color": "#90A4AE", "rx": 10, "ry": 10 },
          { "type": "eyes", "style": "standard", "color": "#263238", "size": 3 },
          { "type": "nose", "color": "#37474F", "rx": 2.5, "ry": 2 },
          { "type": "whiskers", "count": 3, "length": 8 },
          { "type": "mouth", "style": "smile" }
        ]
      }
    }
  ],
  "gear": [
    {
      "id": "earmuffs",
      "name": "Earmuffs",
      "icon": "🎧",
      "slot": "hat",
      "shape": "flower-crown",
      "color": "#E91E63",
      "accentColor": "#F48FB1"
    }
  ]
}
```
