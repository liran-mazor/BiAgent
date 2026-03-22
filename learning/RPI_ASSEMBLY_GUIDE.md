# Raspberry Pi Assembly Guide - Alfred Voice Interface
> Internal reference document. Written for my future self to guide Liran through setup.

---

## What Was Ordered (from piitel.co.il)

### Kit: RPI4 4G Kit with 7" Touchscreen
- Raspberry Pi 4 Model B (4GB RAM)
- Official 7" Touchscreen (800x480, DSI connection via ribbon cable)
- Screen bracket/stand (included)
- SanDisk 32GB microSD card
- Official USB-C power supply
- Micro-HDMI to HDMI cable (1M)
- 2x Black Aluminum Heatsinks
- **NOTE: NO case included in this kit**

### Additional Components
- Official Case for Raspberry Pi 4 (₪30) - for the Pi board only, NOT the screen
- USB Microphone for Raspberry Pi (₪25) - adjustable stand, plug and play (Texas Instruments PCM2902, ID 08bb:2902)
- Mini USB Speaker (₪49) - USB 2.0, 2 built-in speakers, no battery needed (Jieli Technology UACDemoV1.0, ID 4c4a:4155)

---

## Important Hardware Notes

### What plugs where:
- **Screen** → connects to RPi via DSI ribbon cable (NOT HDMI) + GPIO for power
- **USB Mic** → any of the 4 USB ports on RPi (blue USB 3.0 or black USB 2.0 — doesn't matter for audio)
- **USB Speaker** → any of the 4 USB ports on RPi
- **Power** → USB-C port on RPi
- **HDMI cable** → only needed for initial setup with external monitor (optional)

### RPi 4 has built-in WiFi:
- Dual-band WiFi (2.4GHz + 5GHz) - NO WiFi adapter needed
- Bluetooth 5.0 built-in
- After connecting to Liran's home WiFi once, stays connected automatically

### Case situation:
- The official RPi 4 case (₪30) fits the Pi BOARD only
- The 7" screen has its own stand/bracket
- They'll be two separate units connected by cables - this is normal and fine

### SSH access:
- Username: `liran`
- IP: `10.10.1.158`
- `ssh liran@10.10.1.158`
- For X forwarding (Chromium): `ssh -X liran@10.10.1.158`

---

## Current Working State (February 2026)

### What works:
- RPi 4 fully assembled, SSH accessible at `liran@10.10.1.158`
- Node.js v20, Sox, Docker, mpg123 installed
- PostgreSQL running via Docker (`docker compose up -d postgres`)
- DB seeded with e-commerce data + pgvector extension working
- Wake word detection working (Picovoice Porcupine)
- Audio recording working via `pw-record` (PipeWire)
- Google Cloud TTS + audio playback working
- Full Alfred flow working end-to-end
- Cache (pgvector) working
- **Alfred Face Display working** — animated face on 7" touchscreen with states: idle, listening, processing, thinking, speaking
- Face served via `npx serve src/voice -p 3000`, displayed in Chromium kiosk mode
- Lip sync based on TTS audio file size estimation
- faceService.ts handles all WebSocket communication on port 3002
- **Chart Display working** — when Alfred generates a chart, it displays as an overlay on the touchscreen while speaking; tap ✕ to dismiss and return to face

### What's pending:
- Auto-start script on boot (manual startup required after reboot) — `alfred-start.sh` exists but not wired to systemd
- VAD (Voice Activity Detection) — currently using 7-second fixed recording

---

## Audio Architecture on RPi (IMPORTANT)

### The RPi runs PipeWire (not pure ALSA)
PipeWire is the audio server managing all devices. This causes a critical conflict:
- **Porcupine** (wake word) holds the mic via PipeWire while listening
- **Sox** tries to open the mic directly via ALSA → `Device or resource busy` error
- **Solution**: Use `pw-record` instead of Sox for recording — it goes through PipeWire and shares the device

### voiceService.ts on RPi uses pw-record (NOT Sox)
The file `src/services/voiceService.ts` on the RPi is a custom version (`voiceService.rpi.ts` on the PC).
Key differences from PC version:
- `recordUserQuery()` uses `pw-record` instead of `node-record-lpcm16`/Sox
- Has `prepareSpeech()` which returns `{ durationMs, play }` for lip sync timing
- Recording duration: **7 seconds** (updated from 6)

To update voiceService on RPi from PC:
```bash
scp src/services/voiceService.rpi.ts liran@10.10.1.158:~/AgentIQ/src/services/voiceService.ts
```

### /etc/asound.conf (named ALSA devices)
ALSA card numbers change on every reboot! Always use named devices instead.
Current `/etc/asound.conf`:
```
pcm.Mic {
    type plug
    slave {
        pcm {
            type hw
            card "Device"
        }
    }
}

pcm.Speaker {
    type plug
    slave {
        pcm {
            type hw
            card "UACDemoV10"
        }
    }
}

pcm.!default {
    type asym
    playback.pcm "Speaker"
    capture.pcm "Mic"
}
```

Device names (stable, don't change):
- **Mic**: `Device` (C-Media USB PnP Sound Device, Texas Instruments PCM2902)
- **Speaker**: `UACDemoV10` (Jieli Technology UACDemoV1.0)

PipeWire target name for pw-record (stable):
- `alsa_input.usb-C-Media_Electronics_Inc._USB_PnP_Sound_Device-00.analog-mono`

### Mic gain must be set to 50%
After reboot, mic gain may reset. **50% is the correct gain** — 100% causes clipping/saturation (max amplitude 32767).
```bash
amixer -c <card_number> sset Mic 50% && amixer -c <card_number> sset 'Auto Gain Control' off
```
Find card number with `arecord -l` (look for "USB PnP Sound Device").
**NOTE**: You must speak close to the mic — it doesn't pick up from a distance well.

### PvRecorder device index
Porcupine's PvRecorder must be initialized with device index **2** (the USB mic):
```typescript
const recorder = new PvRecorder(handle.frameLength, 2);
```
Check available devices with:
```bash
node -e "const {PvRecorder} = require('@picovoice/pvrecorder-node'); PvRecorder.getAvailableDevices().forEach((d,i) => console.log(i, d));"
```
Expected output:
- 0: Monitor of UACDemoV1.0 Analog Stereo
- 1: Monitor of Built-in Audio Stereo
- 2: PCM2902 Audio Codec Analog Mono ← this is the mic

---

## Face Display Architecture

### Overview
Alfred displays an animated face on the 7" touchscreen using:
- **HTML5 Canvas** rendered in Chromium kiosk mode
- **WebSocket** (port 3002) for state communication from alfred.ts
- **HTTP server** (port 3000) serving `src/voice/face.html`

### Face States
| State | Eyes | Mouth | Special |
|-------|------|-------|---------|
| idle | Half-closed (droopy) | Smile | Floating zzz letters |
| listening | Wide open | Quick open/close | Surprised eyebrows, dilated pupils |
| processing | Slight squint | Quick open/close | Normal |
| thinking | Slightly narrowed | Slight smile | Pupils dart left→right→up slowly |
| speaking | Open | Lips sync to audio | Gentle pupil drift |

### Chart Overlay
When the agent generates a chart (S3 URL), it is displayed as a fullscreen overlay on the touchscreen:
- Chart appears **while Alfred is speaking** the response (synchronized)
- `chartTool.ts` stores the last generated URL in a module-level variable (`lastChartUrl`)
- `alfred.ts` calls `getLastChartUrl()` + `clearLastChartUrl()` after each query (prevents stale chart showing on next query)
- `faceService.ts` exports `sendChart(url)` which sends `{ type: 'chart', url }` via WebSocket
- `face.html` renders the overlay with an ✕ button — tapping it dismisses the chart and returns to idle face

### Key files
- `src/voice/face.html` — Canvas renderer, WebSocket client, chart overlay handler
- `src/services/faceService.ts` — WebSocket server (port 3002), exports sendState/sendQuickMouth/sendSpeak/sendListening/sendProcessing/sendSpeaking/**sendChart**
- `src/interfaces/alfred.ts` — imports from faceService
- `src/tools/chartTool.ts` — exports `getLastChartUrl()` and `clearLastChartUrl()`

### Lip sync timing
- TTS audio duration estimated from MP3 file size: `(bytes / 4000) * 1000` ms
- `sendQuickMouth` has **950ms delay** to align with audio playback start
- `sendSpeaking(durationMs)` has **950ms delay** before firing (RPi only — PC has no delay)
- Chart is sent to face **before** `play()` so it appears as Alfred begins speaking

### Ports used
- **3000** — HTTP server (npx serve, serves face.html)
- **3001** — ForecastAgent (A2A)
- **3002** — WebSocket (faceService ↔ face.html)

---

## Software Stack on RPi

### What's installed:
1. **Raspberry Pi OS** (64-bit)
2. **Node.js v20.20.0**
3. **Sox** - installed but NOT used for recording (PipeWire conflict — see above)
4. **Docker** - runs PostgreSQL with pgvector
5. **mpg123** - audio playback
6. **PipeWire** - audio server (pre-installed, manages all audio)

### Services that must be running:
```bash
docker compose up -d postgres                          # PostgreSQL + pgvector (cache + main DB)
npx serve src/voice -p 3000 &                          # HTTP server for face.html
DISPLAY=:0 chromium --password-store=basic --kiosk "http://localhost:3000/face" &   # Face display
cd ~/AgentIQ && npm run alfred                         # Starts forecast-agent + alfred
```

**IMPORTANT**: After reboot, always run `docker compose up -d postgres` before `npm run alfred`.
System PostgreSQL (port 5432) is disabled — only Docker PostgreSQL is used.

**Shortcut**: `alfred` alias in `~/.bashrc` runs `alfred-start.sh` which does all of the above.

---

## File Structure on RPi

```
/home/liran/
├── AgentIQ/                    # Main project
│   ├── alfred-start.sh         # Startup script (alias: alfred)
│   ├── src/
│   │   ├── interfaces/
│   │   │   ├── alfred.ts       # Main Alfred loop (WAKE_WORD_SENSITIVITY = 0.8, PvRecorder device index 2)
│   │   │   └── alfred-test.ts  # Test interface (no wake word, simulates states)
│   │   ├── services/
│   │   │   ├── voiceService.ts # RPi version using pw-record + prepareSpeech()
│   │   │   └── faceService.ts  # WebSocket server (port 3002) for face display + sendChart()
│   │   ├── tools/
│   │   │   └── chartTool.ts    # lastChartUrl module variable + getLastChartUrl/clearLastChartUrl exports
│   │   └── voice/
│   │       ├── face.html       # Animated face renderer (Canvas + WebSocket client + chart overlay)
│   │       └── audio/
│   │           ├── alfred.ppn              # RPi wake word model
│   │           ├── wakeWordConfirmed.mp3   # "All ears"
│   │           ├── processing.mp3          # "On it"
│   │           └── cancelled.mp3           # Cancel acknowledgment
│   └── .env                    # All API keys (copied from PC)
├── agentiq-mcp-server/         # MCP server (SQL tool)
│   └── .env                    # POSTGRES_HOST/PORT/USER/PASSWORD/DB
└── forecast-agent/             # A2A ForecastAgent
```

### audioPaths.ts (current state):
```typescript
WAKE_WORD: path.join(__dirname, './audio/alfred.ppn'),  // RPi model (renamed from alfred_rpi.ppn)
WAKE_WORD_CONFIRMED: path.join(__dirname, './audio/wakeWordConfirmed.mp3'),
PROCESSING: path.join(__dirname, './audio/processing.mp3'),
CANCELLED: path.join(__dirname, './audio/cancelled.mp3'),
```

---

## Environment Variables

### AgentIQ `.env` (copied from PC):
Contains all keys including POSTGRES_HOST/PORT/USER/PASSWORD/DB pointing to Docker.

### agentiq-mcp-server `.env`:
```
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=agentiq
POSTGRES_PASSWORD=agentiq123
POSTGRES_DB=agentiq
```

---

## Alfred Voice Flow (current implementation)

```
1. Boot RPi → docker compose up -d postgres
2. npx serve src/voice -p 3000 & (HTTP server for face)
3. DISPLAY=:0 chromium --password-store=basic --kiosk "http://localhost:3000/face" & (face display)
4. npm run alfred (starts forecast-agent + alfred)
5. Porcupine listens for wake word "Alfred" (sensitivity: 0.8, device index: 2)
6. Wake word detected → recorder.stop()
7. Face: LISTENING state + surprised eyebrows + quick mouth ("yeah")
8. Play wakeWordConfirmed.mp3
9. recordUserQuery() → 7 seconds recording via pw-record (PipeWire)
10. transcribeAudio() → OpenAI Whisper API
11. If "stop" → Face: PROCESSING + quick mouth → play cancelled.mp3 → Face: IDLE → restart
12. Face: PROCESSING state + quick mouth ("on it") → play processing.mp3
13. Face: THINKING state → agent.run() with [VOICE_INTERFACE] prefix
14. prepareSpeech(response) → generates TTS, returns durationMs + play()
15. [950ms delay] Face: SPEAKING state + lip sync (fast mouth movement synced to audio duration)
16. If chart was generated → sendChart(url) → overlay appears on touchscreen
17. play() → Google Cloud TTS audio plays
18. Face: IDLE → recorder.start() → back to listening
```

### Key implementation notes:
- Recording is **7 seconds** fixed
- `[VOICE_INTERFACE]` prefix triggers 1-2 sentence responses from agent
- TTS voice: `en-GB-Standard-D` (British male - butler character)
- Audio playback has 250ms buffer delay to prevent clipping
- Cancel command: saying "stop" after wake word returns to listening
- Wake word sensitivity: 0.8
- PvRecorder device index: 2 (USB mic)
- Mic gain: 50% (100% causes clipping)
- `sendQuickMouth` delay: **950ms** (aligns mouth animation with audio playback)
- `sendSpeaking` delay: **950ms** (RPi only)
- Chart cleared after each query via `clearLastChartUrl()` to prevent stale display

---

## Picovoice / Wake Word Notes

- **Free tier**: activation limit per key (NOT monthly reset — limited total activations)
- **Account**: mazorliran@gmail.com — new account created Feb 2026
- Platform matters! Linux .ppn ≠ RPi .ppn — different binary files
- Wake word model file on RPi: `src/voice/audio/alfred.ppn` (renamed from alfred_rpi.ppn)
- audioPaths.ts points to `alfred.ppn` (NOT `alfred_rpi.ppn`)
- To get new key: create new account at console.picovoice.ai, get API key, update `PICOVOICE_ACCESS_KEY` in `.env`. The `.ppn` model file does NOT need to change.
- Sensitivity: 0.8 on RPi

---

## PostgreSQL Setup

Using Docker with pgvector (pg16):
```bash
docker compose up -d postgres
```

Schema is already initialized. If starting fresh:
```bash
PGPASSWORD=agentiq123 psql -U agentiq -d agentiq -h localhost -f ~/agentiq-mcp-server/src/schema.sql
npm run seed  # seed with fake e-commerce data
```

**IMPORTANT**: System PostgreSQL is disabled (`sudo systemctl disable postgresql`).
Only Docker PostgreSQL runs on port 5432.

---

## Problems Encountered & Solutions

### Problem 1: Sox "Device or resource busy"
**Symptom**: `sox FAIL formats: can't open input 'plughw:3,0': snd_pcm_open error: Device or resource busy`
**Cause**: RPi runs PipeWire. Porcupine holds the mic via PipeWire. Sox tries to open ALSA directly → conflict.
**Solution**: Replace Sox with `pw-record` in `voiceService.ts`. pw-record goes through PipeWire and shares the device.

### Problem 2: ALSA card numbers change on reboot
**Symptom**: `plughw:3,0` worked yesterday, today mic is on card 4 or card 1.
**Cause**: USB devices enumerate in different order on boot.
**Solution**: Use named devices in `/etc/asound.conf` (`card "Device"` and `card "UACDemoV10"`). These names are stable.

### Problem 3: Mic records only silence / white noise
**Symptom**: `arecord` creates a file but playback is silence or static.
**Cause 1**: Mic gain was at 0%. Fix: `amixer -c <n> sset Mic 50%`
**Cause 2**: Must speak very close to the mic (within ~10cm).
**Cause 3**: PipeWire stopped — restart with `systemctl --user restart pipewire pipewire-pulse wireplumber`

### Problem 4: pw-record exits with error 1
**Symptom**: pw-record fails immediately
**Cause**: PipeWire not running or target device name wrong.
**Fix**: Check PipeWire is running (`pw-cli info 0`), verify target name with `pw-cli list-objects | grep -i "usb\|capture"`

### Problem 5: pgvector / cache auth failure
**Symptom**: `password authentication failed for user "agentiq"`
**Cause**: System PostgreSQL running instead of Docker, OR Docker not started after reboot.
**Solution**: 
1. `sudo systemctl stop postgresql && sudo systemctl disable postgresql`
2. `docker compose up -d postgres`

### Problem 6: Picovoice activation limit reached
**Symptom**: `PorcupineActivationLimitReachedError`
**Cause**: Free tier API key hit total activation limit (NOT monthly — lifetime limit per key).
**Solution**: Create new Picovoice account at console.picovoice.ai, get new API key, update `PICOVOICE_ACCESS_KEY` in `.env`. The `.ppn` model file does NOT need to change.

### Problem 7: Docker port conflict on startup
**Symptom**: `failed to bind host port 0.0.0.0:5432/tcp: address already in use`
**Cause**: System PostgreSQL running on port 5432.
**Solution**: `sudo systemctl stop postgresql` then `docker compose up -d postgres`

### Problem 8: recorder.release() breaks restart
**Symptom**: After first query, Alfred stops detecting wake word on second attempt.
**Cause**: Calling `recorder.release()` destroys the PvRecorder instance — `recorder.start()` no longer works.
**Solution**: Remove `recorder.release()`. Just call `recorder.stop()` then `recorder.start()`.

### Problem 9: Wake word not detected after reboot
**Symptom**: Alfred starts, says "Listening for wake word" but never detects "Alfred".
**Cause**: PvRecorder defaulting to wrong audio device (index -1 = system default, not the USB mic).
**Solution**: Pass device index 2 explicitly: `new PvRecorder(handle.frameLength, 2)`
Verify device index with: `node -e "const {PvRecorder} = require('@picovoice/pvrecorder-node'); PvRecorder.getAvailableDevices().forEach((d,i) => console.log(i, d));"`

### Problem 10: Mic clipping / max amplitude 32767
**Symptom**: All amplitude values at 32767 (maximum), audio sounds distorted.
**Cause**: Mic gain at 100% causes saturation.
**Solution**: Set mic gain to 50%: `amixer -c <n> sset Mic 50%`

### Problem 11: Face lips move before audio plays
**Symptom**: Mouth animation starts ~1 second before sound is heard.
**Cause**: sendQuickMouth fires immediately but playSound has startup delay.
**Solution**: 950ms delay on sendQuickMouth and sendSpeaking in faceService.ts / alfred.ts aligns animation with audio.

### Problem 12: Chromium keyring popup on launch
**Symptom**: "Choose password for new keyring" dialog appears when launching Chromium.
**Solution**: Launch with `--password-store=basic` flag:
```bash
DISPLAY=:0 chromium --password-store=basic --kiosk "http://localhost:3000/face"
```

### Problem 13: WebSocket port conflict with ForecastAgent
**Symptom**: `Error: listen EADDRINUSE :::3001`
**Cause**: ForecastAgent uses port 3001. faceService.ts was also trying to use 3001.
**Solution**: faceService.ts uses port 3002.

### Problem 14: Chart displays on every query (stale URL)
**Symptom**: After asking a chart question, subsequent non-chart queries still show the chart.
**Cause**: `lastChartUrl` in chartTool.ts was never reset between queries.
**Solution**: Added `clearLastChartUrl()` export. Called in alfred.ts after reading the URL — `getLastChartUrl()` then immediately `clearLastChartUrl()`.

### Problem 15: Chart S3 URL not in voice response
**Symptom**: Chart was generated but never displayed — regex on agent response found nothing.
**Cause**: `[VOICE_INTERFACE]` prefix causes agent to return a short 1-2 sentence answer without the S3 URL.
**Solution**: Instead of parsing the response text, read `lastChartUrl` directly from chartTool.ts module state.

---

## Quick Start After Reboot

```bash
# Option 1: alias (recommended)
alfred

# Option 2: manual
cd ~/AgentIQ && docker compose up -d postgres
npx serve src/voice -p 3000 &
DISPLAY=:0 chromium --password-store=basic --kiosk "http://localhost:3000/face"
npm run alfred
```

---

## Testing Audio Without Alfred

```bash
# Check available audio devices
arecord -l

# Test mic recording (5 seconds) via ALSA
arecord -D plughw:<card>,0 -f S16_LE -r 16000 -c 1 -d 5 /tmp/test.wav && pw-play /tmp/test.wav

# Test via PipeWire
pw-record --rate 16000 --channels 1 --target="alsa_input.usb-C-Media_Electronics_Inc._USB_PnP_Sound_Device-00.analog-mono" /tmp/test.wav
# (Ctrl+C after speaking)
pw-play /tmp/test.wav

# Check mic amplitude (speak during test — should see values 10k-25k, NOT 32767)
node -e "
const {PvRecorder} = require('@picovoice/pvrecorder-node');
const r = new PvRecorder(512, 2);
r.start();
const iv = setInterval(() => r.read().then(pcm => console.log('Max:', Math.max(...pcm.map(Math.abs)))), 100);
setTimeout(() => { clearInterval(iv); r.stop(); process.exit(0); }, 3000);
"

# Set mic gain to 50% (correct level)
amixer -c $(arecord -l | grep -oP 'card \K[0-9]+' | head -1) sset Mic 50%
amixer -c $(arecord -l | grep -oP 'card \K[0-9]+' | head -1) sset 'Auto Gain Control' off
```

---

## Terminal Setup During Development

3 terminals needed:
- **RPi Terminal 1** — general commands, running `npm run alfred`
- **RPi Terminal 2** — running Chromium (stays occupied)
- **PC Terminal** — `scp` files to RPi

Connect RPi terminals via SSH: `ssh liran@10.10.1.158`
For Chromium (needs display): `ssh -X liran@10.10.1.158` then use `DISPLAY=:0`

---

## Future Enhancements

### Auto-start on Boot (planned)
Wire `alfred-start.sh` to systemd so Alfred starts automatically on boot without manual SSH.

### VAD (Voice Activity Detection) - Future
- Attempted with @ricky0123/vad-node (NonRealTimeVAD - wrong for live audio)
- Attempted with @picovoice/cobra-node (couldn't initialize properly)
- Currently using 7-second fixed recording
- Try again with real RPi hardware

---

## Liran's Preferences & Style Notes

- Prefers ONE instruction at a time - never overload with options
- Needs step-by-step guidance
- Single responsibility principle is important to him
- Centralized configs preferred (like audioPaths.ts pattern)
- Hates when too many options are given - always pick one and recommend it
- Hebrew speaker - may speak Hebrew to Alfred (Whisper handles this fine)
- Must speak close to mic (within ~10cm) for reliable detection
- Tests on PC first, then deploys to RPi
- `alfred` alias set in `~/.bashrc` on RPi for quick startup

---

*Last updated: February 2026*
*Status: Working end-to-end with animated face display, chart overlay on 7" touchscreen*
*Maintainer: Liran Mazor*
