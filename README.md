# MediPulse - Full-Stack Smart Medicine Reminder & Tracker (Ruby Edition) 💊💎⏰

**MediPulse** is a modern full-stack, intelligent medicine reminder, cabinet stock tracker, and adherence analytics application. The backend is written in **Ruby**, providing a complete RESTful API, thread-safe JSON persistence, pharmacology interaction checking, and static asset delivery paired with a responsive interactive frontend.

---

## 🌟 Full-Stack Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MediPulse Frontend                       │
│  (Tailwind CSS, Lucide Icons, Web Audio Synth, Push Alerts) │
└──────────────────────────────┬──────────────────────────────┘
                               │ REST API (JSON / HTTP)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Ruby Backend (server.rb / app.rb)           │
│                                                             │
│   • Primary Server: server.rb (WEBrick / Pure TCPServer)    │
│   • Sinatra Alternative: app.rb (bundle exec ruby app.rb)   │
│   • Persistence: medicine_data.json (Thread-safe JSON Store)│
│   • Engines: DrugSafetyEngine, AdherenceAnalytics           │
│   • Endpoints: /api/medications, /api/logs, /api/analytics  │
│   • AI Safety / Interaction Scanner: /api/ai/audit          │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 How to Run with Ruby

### Option 1: Standalone Ruby Server (Zero Gems Required, Recommended)
Runs out of the box with standard Ruby on Windows, macOS, or Linux without installing any external gems:
```bash
ruby server.rb
```
- Starts immediately on **http://localhost:8000**
- Serves the frontend UI and all REST API endpoints.
- Auto-seeds `medicine_data.json` with initial medications and logs if not present.
- Uses WEBrick if available, with an automatic fallback to pure Ruby `TCPServer`.

---

### Option 2: Sinatra Microframework Stack
If you prefer running with Sinatra:
```bash
# 1. Verify bundle dependencies (Sinatra, WEBrick, Rack-CORS):
bundle check

# 2. Start the Sinatra server:
bundle exec ruby app.rb
```
- Starts on **http://localhost:8000**
- Shares identical clinical rules, analytics, and data persistence.

---

### Option 3: Offline / Direct Browser Mode
You can also open [`index.html`](file:///c:/antigravity/index.html) directly in any browser. If the Ruby backend is not currently running, MediPulse smoothly switches to local browser storage mode (`localStorage`) without throwing errors. Once you run `ruby server.rb`, the header badge turns green: **"Backend Connected (Ruby)"**.

---

## 🧪 Running the Automated Test Suite

A comprehensive test suite built on Ruby's `minitest` validates all API endpoints, persistence, stock auto-decrement, refill logic, and drug interaction audits:

```bash
ruby test_server.rb
```

Sample output:
```text
Run options: --seed 13052
# Running:
............
Finished in 0.062s, 191 runs/s, 589 assertions/s.
12 runs, 37 assertions, 0 failures, 0 errors, 0 skips
```

---

## 📡 Ruby REST API Reference

| HTTP Method | Route | Description |
|---|---|---|
| `GET` | `/api/status` | Health check & Ruby engine version (`Ruby #{RUBY_VERSION}`) |
| `GET` | `/api/analytics` | Real-time adherence rate %, current streak days, and low stock count |
| `GET` | `/api/medications` | Fetch all active prescription medications |
| `POST` | `/api/medications` | Add a new medication with dose schedules, stock, and food conditions |
| `PUT` | `/api/medications/:id` | Update medication details, times, or instructions |
| `DELETE` | `/api/medications/:id` | Remove a medication and its related logs |
| `POST` | `/api/medications/:id/refill` | Refill medication stock (+10, +30, or custom amount) |
| `GET` | `/api/logs` | Fetch dose adherence logs (taken, snoozed, skipped) |
| `POST` | `/api/logs` | Record a dose event (auto-decrements inventory on taken) |
| `DELETE` | `/api/logs` | Reset / clear dose logs |
| `GET` | `/api/settings` | Retrieve user preferences (chime tone, snooze minutes, doctor contact) |
| `POST` | `/api/settings` | Save updated user preferences |
| `POST` | `/api/ai/audit` | Server-side pharmacology interaction & safety auditor (`DrugSafetyEngine`) |

---

## 💡 Key Smart Features

1. **Synthesized Web Audio Alarms**: 4 distinct melodic chime tones (*Melodic Chime*, *Digital Beep*, *Urgent Warble*, *Zen Temple Bell*) generated via Web Audio API oscillators.
2. **Native Push Notifications**: Desktop / browser system notifications alert you even when the tab is in the background.
3. **Live Countdown Banner**: Real-time ticker counting down hours, minutes, and seconds until the next scheduled dose.
4. **Auto-Stock Decrement & Refill Alerts**: When a dose is marked taken, stock is decremented in the Ruby database. Low-stock badges appear when pills fall below threshold.
5. **Adherence Analytics**: Calculates compliance score percentage, 7-day compliance history indicators, and consecutive day streak counter with celebratory confetti.
6. **AI Safety & Drug Interaction Scanner (`DrugSafetyEngine`)**:
   - Hyperkalemia Hazard (ACE inhibitors / ARBs + Potassium-sparing agents)
   - Major Hemorrhage Risk (Anticoagulants / Antiplatelets + NSAIDs)
   - Serotonin Toxicity Risk (SSRIs/SNRIs + Serotonergic agents)
   - CNS & Respiratory Depression (Opioids + Sedatives/Benzodiazepines)
   - Thyroid Hormone Chelation (Levothyroxine + Polyvalent Minerals)
   - Metformin + Alcohol Contraindication
   - Renal Perfusion Impairment (ACEi/ARBs + NSAIDs)
   - Statin Metabolism & Grapefruit Advisory
   - Duplicate Therapy Detection
7. **Caregiver / Emergency Quick Access**: Configure doctor contact information and emergency phone numbers.
8. **Data Portability**: Full JSON export and import for seamless backups.

---

## 📁 Repository Structure
- [`server.rb`](file:///c:/antigravity/server.rb): **Primary Ruby backend server** (WEBrick + pure Ruby TCPServer fallback, zero external gem runtime dependencies).
- [`app.rb`](file:///c:/antigravity/app.rb): **Sinatra edition backend** (Modular Sinatra alternative).
- [`test_server.rb`](file:///c:/antigravity/test_server.rb): Automated test suite for all endpoints and engines.
- [`Gemfile`](file:///c:/antigravity/Gemfile): Bundler dependency manifest for Sinatra & WEBrick.
- [`index.html`](file:///c:/antigravity/index.html): Responsive dashboard, schedule timeline, and cabinet UI with live backend status.
- [`app.js`](file:///c:/antigravity/app.js): Full-stack client, Web Audio synthesizer, background scheduler, and REST API sync.
- [`style.css`](file:///c:/antigravity/style.css): Custom animation keyframes, pill status indicators, and design tokens.
- [`medicine_data.json`](file:///c:/antigravity/medicine_data.json): JSON database file automatically created and maintained by Ruby.
