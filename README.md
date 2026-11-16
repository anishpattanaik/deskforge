---
title: DeskForge
emoji: 🗂️
colorFrom: yellow
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
short_description: One desk photo → a custom 3D-printable organizer
---

# DeskForge: photo to printable desk organizer

Snap a photo of a messy desk. Claude catalogues every loose item and cable with
millimetre estimates. A CadQuery script then compiles a custom tray with a
pocket for each item and snap-in clips for each cable. You inspect it in a live
3D viewer, adjust it with sliders, and download the STL.

```
 photo ──► Claude vision (structured JSON) ──► editable cards + sliders
                                                     │  (debounced)
                     STL ◄── CadQuery solid ◄── layout packer
                      │
                      └──► Three.js viewer ──► Download STL ──► 3D printer
```

## Architecture

| Layer | File | What it does |
|---|---|---|
| API | `backend/app/main.py` | FastAPI routes, upload handling, demo fallback, STL serving |
| Local vision | `backend/app/local_vision.py` | Free offline provider: Ollama model with the same JSON schema enforced through Ollama's `format`, health/model checks, friendly errors |
| Vision | `backend/app/vision.py` | Image validation/resizing, Claude call with **structured outputs** (`messages.parse` + Pydantic schema), refusal handling, value clamping |
| Schema | `backend/app/schemas.py` | `DeskAnalysis` (the vision contract) and `GenerateRequest` (validated CAD inputs) |
| Layout | `backend/app/layout.py` | Pure-Python shelf packer: tries 3 orientations x 6 row widths, keeps the smallest layout that fits the printer bed, adds a cable rail |
| CAD | `backend/app/cad.py` | CadQuery: shared-wall blocks, filleted finger-scoop pockets, engraved labels, snap-fit cable clips, STL export + filament estimate |
| Errors | `backend/app/errors.py` | Typed errors returned as `{"error": {code, message, hint}}` |
| Camera | `frontend/src/components/CameraCapture.jsx` | Webcam capture modal: camera picker, bank-card framing guide, retake, permission/busy/no-camera errors; falls back to the phone's native camera |
| Prompt edits | `backend/app/edit.py` | "Ask for changes": the AI edits **parameters only** (settings plus add/update/remove item and cable ops), validated and clamped. The change list is **diffed from the real before/after state**, and guards block edits to items the prompt didn't mention |
| Website | `frontend/src/site/*` | Landing site in an engineering "drawing set" style: scroll-pinned 3D story (real CadQuery model rotates, x-ray scans, lights its pockets and "prints" layer by layer), JSON terminal, tilt/glow feature cards, draggable spec sheets, FAQ, scroll-progress header |
| Generator | `frontend/src/Generator.jsx` | The tool itself, embedded at `#generator`, with undo history for prompt edits |
| UI | `frontend/src/App.jsx` | Upload → analyse → tune → print flow, live regeneration with abortable requests |
| Viewer | `frontend/src/components/Viewer.jsx` | react-three-fiber STL viewer: labels, pocket highlight on hover, wireframe, turntable |

### How the vision step stays reliable
* **Scale reference (any object):** before shooting, pick what's in the photo for scale:
  bank card, business card, sticky note, A4/Letter, coin, AA battery, 30 cm ruler, or
  **Something else** with your own name and size (e.g. "TV remote, 180 × 45 mm"). The AI is
  told exactly what to look for and how big it is. The reference is automatically left out of
  the pockets, but only when both its name and size match, so a real sticky-note pad still
  gets one. See `backend/app/reference.py`.
* **Bounded local output:** the local model's JSON is capped while it's written (max 12 items,
  6 cables, short text fields) using Ollama's grammar, so a busy photo always finishes
  (a 24-object test finished in 95 s). Before this cap, a real cluttered photo ran 3.5 min without finishing.
* **Structured output:** the response must match the `DeskAnalysis` Pydantic
  schema, so there's no JSON parsing guesswork. Values are clamped into
  buildable ranges afterwards.
* **Human in the loop:** every dimension is a slider, so estimation errors
  are fixed in seconds and the model rebuilds live.
* **Demo fallback:** with no API key, or if the call fails, the app can serve
  a sample analysis so the demo never dead-ends.

### Robustness
* Uploads are checked for type, size (15 MB), decodability and EXIF rotation,
  then downscaled to 1568 px before sending.
* Claude errors (auth, rate limit, bad request, connection, refusal, truncation)
  each map to a clear message plus a hint.
* CAD steps that are only cosmetic (fillets, text) degrade gracefully instead of
  failing the build.
* Model IDs are validated before serving files. Old STLs are pruned.
* The frontend aborts stale generate requests, keeps the previous mesh on screen
  while the next one compiles, and has error boundaries around the UI and the
  WebGL canvas.

## Run it

### Quick start (Windows)
Double-click **`start.bat`**. On first run it sets up Python and builds the web app if needed, then
opens http://localhost:8000. Close the black window to stop the app.

### Which AI analyses the photo?
The app picks automatically:

| Priority | Provider | Cost | Speed | Needs |
|---|---|---|---|---|
| 1 | Claude (`claude-opus-5-5`) | API credits | a few seconds | `ANTHROPIC_API_KEY` |
| 2 | Local Qwen2.5-VL 7B via Ollama | free, offline | ~1 min on an Intel Arc iGPU (measured 59 s; ~2 min on CPU only) | [Ollama](https://ollama.com) + `ollama pull qwen2.5vl:7b` |
| 3 | Demo data | free | instant | nothing |

On first launch, `start.bat` offers to save a Claude key. Press Enter to skip it and use the free
local AI. You can add a key later:
```bash
setx ANTHROPIC_API_KEY "sk-ant-..."
```
**Faster local AI on Intel/AMD integrated graphics:** Ollama skips integrated GPUs by default.
Turn them on once, then restart Ollama (quit it from the tray and reopen it):
```bash
setx OLLAMA_IGPU_ENABLE 1
```
On an Intel Arc 140V this cut analysis time from about 2.2 min to 59 s, with identical results.

Force a provider with `DESKFORGE_VISION=claude|local`, or swap the local model with
`DESKFORGE_LOCAL_MODEL`.

### Developer mode (hot reload)

#### 1. Backend (Python 3.11+)
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
set ANTHROPIC_API_KEY=sk-ant-...   # PowerShell: $env:ANTHROPIC_API_KEY="sk-ant-..."
uvicorn app.main:app --port 8000
```
Leave out the key to run in demo mode.

Offline CAD check (no server or key needed):
```bash
python smoke_test.py
```

#### 2. Frontend (Node 18+)
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:5173. Vite proxies `/api` to the backend.

For a single-server demo, run `npm run build`. FastAPI then serves `frontend/dist` at
http://localhost:8000.

## Deploy (free) on Hugging Face Spaces

The repo is a ready-made Docker Space: the `Dockerfile` builds the website, installs
CadQuery and serves everything on port 7860.

1. Create a Space at https://huggingface.co/new-space: SDK **Docker**, template **Blank**, hardware **CPU basic (free)**.
2. In this GitHub repo go to **Settings → Secrets and variables → Actions**, then add
   the secret `HF_TOKEN` (a Hugging Face token with *write* access) and the variable `HF_SPACE`
   (e.g. `your-name/deskforge`).
3. Push to `main` (or run the *Deploy to Hugging Face Space* workflow). The Space builds itself.

Online there's no Ollama, so the public site uses the **demo desk** for photos unless you add an
`ANTHROPIC_API_KEY` secret to the Space. If you do, each visitor is limited to 8 AI calls an
hour and 150 a day in total (`DESKFORGE_AI_PER_HOUR`, `DESKFORGE_AI_PER_DAY`), so strangers
can't drain your credit. Sliders, CAD rebuilds and STL downloads are free to use, with only a
basic rebuild throttle.

## Config
| Env var | Default | |
|---|---|---|
| `ANTHROPIC_API_KEY` | none | Enables live vision |
| `DESKFORGE_MODEL` | `claude-opus-5-5` | Vision model |

## Demo video script (about 2.5 min)

1. **Hook (10 s).** Show the real messy desk, then the printed tray with everything in it.
   "One photo became this in about a minute."
2. **Problem (15 s).** Off-the-shelf organizers don't fit *your* stuff, and designing one in CAD takes hours.
3. **Snap (15 s).** Take a photo with a bank card in frame and drop it into DeskForge. The scan animation plays.
4. **Analyse (25 s).** Walk through the result: summary, clutter score, the green "Scaled from a bank card" chip,
   items with confidence, cables with diameters. Say that Claude returns *schema-validated JSON*, not prose.
4b. **Ask for changes (20 s).** Type "add a pocket for my watch and engrave APEX on the front".
   The ✓ list comes from a real diff, and impossible asks ("add a hinged lid") are reported honestly. Click Undo.
5. **Tune (35 s), the money shot.** Hover a card and its pocket lights up. Drag a slider and the tray rebuilds
   live (draft in about 1 s, labelled build about 3 s later). Untick the keys and the layout repacks. Switch the
   bed to Ender 3 and it repacks to fit. Turn on Turntable and Wireframe.
6. **Under the hood (25 s).** Show the architecture diagram from this README: Claude vision → layout packer
   (3 orientations × 6 row widths) → CadQuery (shared walls, filleted scoops, engraved labels,
   snap-fit cable clips) → STL.
7. **Print (20 s).** Click Download STL, show the slicer, then a time-lapse clip of the print.
8. **Close (10 s).** Put the items in the printed tray and snap a cable into its clip.

Tips: record at 1440p with the browser zoomed to 110%. Start the print early, since a tray this size takes
4–6 h. If the live call is slow while recording, the **Try the demo desk** button gives the same flow instantly.

## Printing notes
* PLA, 0.2 mm layers, 2 walls, 15% infill. No supports needed: every surface is
  either vertical or faces up.
* The cable clips snap in because the mouth is about 78% of the cable diameter.
  If a clip is too tight, raise the cable's diameter slider by 0.3 mm.
* Default bed is 250 mm. Pick your printer in the **Bed** dropdown.
