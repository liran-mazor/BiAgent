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
- USB Microphone for Raspberry Pi (₪25) - adjustable stand, plug and play
- Mini USB Speaker (₪49) - USB 2.0, 2 built-in speakers, no battery needed

---

## Important Hardware Notes

### What plugs where:
- **Screen** → connects to RPi via DSI ribbon cable (NOT HDMI) + GPIO for power
- **USB Mic** → any of the 4 USB ports on RPi
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

---

## Software Stack on RPi

### What needs to be installed (in order):
1. **Raspberry Pi OS** (64-bit recommended) - flash to microSD
2. **Node.js v20+** - same as dev machine (Liran uses v20.19.6)
3. **Sox** - audio recording backend (`sudo apt install sox`)
4. **npm packages** - from package.json (npm install)
5. **Google Cloud credentials** - for TTS
6. **.env file** - all API keys

### Critical files to copy/update:
- `.env` file with ALL keys (see below)
- `src/voice/wake-word/alfred_rpi.ppn` - THE RPi-SPECIFIC wake word model (NOT the Linux one!)

---

## File Structure (as of this writing)

```
agentiq/src/
├── interfaces/
│   └── voiceInterface.ts      # Main Alfred loop
├── voice/
│   ├── wake-word/
│   │   ├── alfred.ppn         # Linux version - DON'T use on RPi
│   │   └── alfred_rpi.ppn     # RPi version - USE THIS on RPi
│   ├── audio/
│   │   ├── ack.mp3            # "On it"
│   │   └── confirmation.mp3   # "All ears"
│   └── temp/                  # Generated audio files (gitignored)
│       ├── tts-response.mp3
│       └── voice-query.wav
├── utils/
│   └── voiceHelpers.ts        # recordUserQuery, transcribeAudio, speakText, playSound
└── ...
```

### audioPaths.ts centralizes all paths:
```typescript
CONFIRMATION: path.join(__dirname, './audio/confirmation.mp3'),
ACK: path.join(__dirname, './audio/ack.mp3'),
WAKE_WORD: path.join(__dirname, './wake-word/alfred.ppn'),  // ← CHANGE TO alfred_rpi.ppn on RPi!
WAKE_WORD_RPI: path.join(__dirname, './wake-word/alfred_rpi.ppn'),
TEMP_TTS_RESPONSE: path.join(__dirname, './temp/tts-response.mp3'),
TEMP_VOICE_QUERY: path.join(__dirname, './temp/voice-query.wav'),
```

**IMPORTANT:** When setting up on RPi, update `AUDIO_PATHS.WAKE_WORD` to point to `alfred_rpi.ppn`!

---

## Environment Variables (.env)

All of these must be present on the RPi:

```
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
PICOVOICE_ACCESS_KEY=           # Use friend's account key (trained RPi model)
GOOGLE_APPLICATION_CREDENTIALS= # Path to Google Cloud service account JSON
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
AWS_S3_BUCKET=
TAVILY_API_KEY=
DATABASE_URL=                   # PostgreSQL connection string
SMTP_HOST=
SMTP_PORT=
SMTP_SECURE=
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=
TELEGRAM_BOT_TOKEN=
```

---

## Alfred Voice Flow (current implementation)

```
1. Boot RPi → auto-start Alfred (npm run voice)
2. Porcupine listens for wake word "Alfred" (sensitivity: 0.9)
3. Wake word detected → recorder.stop()
4. Play confirmation.mp3 ("All ears")
5. recordUserQuery() → 6 seconds recording via node-record-lpcm16 + Sox
6. Play ack.mp3 ("On it")
7. transcribeAudio() → OpenAI Whisper API → returns "[VOICE_INTERFACE] {text}"
8. agent.run(query) → ReAct loop (Haiku routes, Sonnet executes if complex)
9. speakText(response) → Google Cloud TTS → play audio
10. recorder.start() → back to listening
```

### Key implementation notes:
- Recording is 6 seconds fixed (VAD was attempted with Picovoice Cobra but abandoned)
- `[VOICE_INTERFACE]` prefix is added inside `transcribeAudio()` - triggers 1-2 sentence responses
- TTS voice: `en-GB-Standard-D` (British male - butler character)
- Audio playback has 250ms buffer delay to prevent clipping
- Sox is required as recording backend - must be installed on RPi

---

## Picovoice / Wake Word Notes

- **Free tier**: 1 custom wake word model per month
- **Liran's account**: Has Linux version (alfred.ppn)
- **Friend's account**: Has RPi version (alfred_rpi.ppn) - USE THIS KEY
- Platform matters! Linux .ppn ≠ RPi .ppn - they are different binary files
- If Picovoice key expires or hits limit, need to retrain from console.picovoice.ai
- Sensitivity is set to 0.9 (high) - may need tuning on RPi with different mic

---

## Step-by-Step Setup on RPi (when hardware arrives)

### Step 1: Flash OS
```bash
# On Liran's PC - download Raspberry Pi Imager
# Flash: Raspberry Pi OS (64-bit) to microSD card
# Enable SSH during flash (saves needing monitor)
```

### Step 2: First Boot
```bash
# Connect: screen via ribbon cable, mic via USB, speaker via USB, power
# OR connect HDMI to monitor for visual setup
# Boot → connect to WiFi
```

### Step 3: SSH from Liran's PC (optional, headless)
```bash
ssh pi@raspberrypi.local
# or find IP from router admin panel
```

### Step 4: Install dependencies
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nodejs npm sox git
node --version  # Should be 18+ (if not, install via nvm)
```

### Step 5: Install Node.js v20 (if needed)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Step 6: Clone code
```bash
cd ~
git clone https://github.com/[liran's-repo]/agentiq.git
cd agentiq
npm install
```

### Step 7: Setup environment
```bash
# Copy .env from dev machine or create new one
nano .env
# Paste all environment variables
```

### Step 8: Setup Google Cloud credentials
```bash
# Copy service account JSON to RPi
# Set GOOGLE_APPLICATION_CREDENTIALS=/home/pi/google-credentials.json
```

### Step 9: Update wake word path
```bash
# In src/voice/audioPaths.ts:
# Change WAKE_WORD to point to alfred_rpi.ppn
```

### Step 10: Create temp directory
```bash
mkdir -p src/voice/temp
```

### Step 11: Test
```bash
npm run voice
# Say "Alfred" → should respond
```

---

## PostgreSQL on RPi

**Decision needed:** Run PostgreSQL locally on RPi OR connect to existing cloud/dev DB?

**Options:**
1. **Local Docker** - `docker-compose up -d` (resource intensive on RPi)
2. **Local PostgreSQL** - `sudo apt install postgresql` (lighter)
3. **Remote DB** - Point DATABASE_URL to existing PostgreSQL (easiest)

**Recommendation:** Use remote DB initially, add local later if needed.

---

## Potential RPi-Specific Issues to Watch For

1. **Sox not found** → `sudo apt install sox`
2. **Mic not detected** → `arecord -l` to list devices, may need to specify device
3. **Speaker not working** → `aplay -l` to list, check audio output settings
4. **Picovoice error** → Ensure using RPi .ppn + correct API key
5. **Node.js version** → Must be 18+ for some packages
6. **Permission errors** → May need `sudo` for audio device access
7. **Memory** → 4GB should be fine, but close other processes if sluggish

---

## Future Enhancements (Not Yet Built)

### Alfred Face Display (planned)
- Use 7" touchscreen to show animated face
- States: sleeping, listening, thinking, speaking
- Files to create: `src/voice/faces/renderer.ts`, `animations.ts`, `lipSync.ts`
- Mouth sync with audio duration from TTS
- Liran wants minimal face: just eyes + mouth

### Auto-start on Boot
```bash
# Add to /etc/rc.local or create systemd service
# so Alfred starts automatically when RPi powers on
```

### VAD (Voice Activity Detection) - Future
- Attempted with @ricky0123/vad-node (NonRealTimeVAD - wrong for live audio)
- Attempted with @picovoice/cobra-node (couldn't initialize properly)
- Currently using 6-second fixed recording
- Try again when testing on real RPi hardware with actual mic

---

## Liran's Preferences & Style Notes

- Prefers ONE instruction at a time - never overload with options
- Needs step-by-step guidance - zero RPi experience
- Code style: require() throughout (CommonJS), not ES module imports
- Single responsibility principle is important to him
- Centralized configs preferred (like audioPaths.ts pattern)
- Hates when I give too many options - always pick one and recommend it
- Hebrew speaker - may speak Hebrew to Alfred (Whisper handles this fine)

---

*Last updated: February 2026*
*Hardware ordered from piitel.co.il - awaiting delivery*
