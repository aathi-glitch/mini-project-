      osc.frequency.setValueAtTime(700, now);
      osc.frequency.linearRampToValueAtTime(1050, now + 0.25);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.26);
    }
  }

  // --- CORE TICKER LOOP ---
  tick() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const currentTimeStr = `${hours}:${minutes}`;

    // Update digital clock in UI if element exists
    const clockEl = document.getElementById("digitalClock");
    if (clockEl) {
      clockEl.textContent = `${currentTimeStr}:${seconds}`;
    }

    // Only trigger alarm processing at the start of a new minute
    if (seconds === "00") {
      this.checkAlarms(currentTimeStr, now);
    }
  }

  checkAlarms(timeString, nowInstance) {
    const todayStr = nowInstance.toISOString().split("T")[0];

    for (const med of this.medications) {
      for (const scheduledTime of med.times) {
        let targetTime = scheduledTime;

        // Check if this specific dose has an active snooze modification
        const snoozeKey = `${med.id}_${scheduledTime}`;
        if (this.snoozes[snoozeKey]) {
          const snoozeTime = this.snoozes[snoozeKey];
          const currentTotalMinutes = nowInstance.getHours() * 60 + nowInstance.getMinutes();
          if (currentTotalMinutes === snoozeTime) {
            targetTime = timeString; // The snooze window has elapsed
          } else {
            continue; // Skip evaluation until the snooze window hits
          }
        }

        if (targetTime === timeString) {
          // Verify that this medication dose hasn't already been addressed today
          const alreadyLogged = this.logs.some(log => 
            log.medId === med.id && 
            log.scheduledTime === scheduledTime && 
            log.date === todayStr
          );

          if (!alreadyLogged && (!this.activeAlarm || this.activeAlarm.medId !== med.id)) {
            this.triggerAlarm(med, scheduledTime);
            return; // Trigger one critical alarm modal window at a time
          }
        }
      }
    }
  }

  triggerAlarm(med, scheduledTime) {
    this.activeAlarm = { medId: med.id, medName: med.name, scheduledTime };
    this.ensureAudioUnlocked();

    // Loop synthesizer audio rhythmically
    this.playSynthesizedAlarm();
    this.alarmAudioInterval = setInterval(() => {
      this.playSynthesizedAlarm();
    }, 1200);

    // Render configuration to DOM overlay modal
    const modal = document.getElementById("alarmModal");
    const title = document.getElementById("alarmTitle");
    const details = document.getElementById("alarmDetails");

    if (modal && title && details) {
      title.textContent = `Time for ${med.name}!`;
      details.textContent = `${med.dosage} (${med.form}) - ${med.foodCondition}. Scheduled for ${scheduledTime}`;
      modal.classList.remove("hidden");
      modal.classList.add("flex");
    }
  }

  dismissAlarm(status) {
    if (this.alarmAudioInterval) {
      clearInterval(this.alarmAudioInterval);
      this.alarmAudioInterval = null;
    }

    const modal = document.getElementById("alarmModal");
    if (modal) {
      modal.classList.remove("flex");
      modal.classList.add("hidden");
    }

    if (!this.activeAlarm) return;

    const { medId, medName, scheduledTime } = this.activeAlarm;
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const timeStr = now.toTimeString().split(" ")[0];

    if (status === "taken" || status === "missed") {
      const targetMed = this.medications.find(m => m.id === medId);
      
      // Deduct inventory items if taken successfully
      if (status === "taken" && targetMed && targetMed.stock > 0) {
        targetMed.stock--;
      }

      const newLog = {
        id: "log_" + Math.random().toString(36).substr(2, 9),
        medId,
        medName,
        dosage: targetMed ? targetMed.dosage : "",
        scheduledTime,
        date: dateStr,
        timestamp: `${dateStr} ${timeStr}`,
        status
      };

      this.logs.unshift(newLog); // Put new data tracking nodes at front of records

      // Remove any active snooze references for this scheduled block
      delete this.snoozes[`${medId}_${scheduledTime}`];

      // Dispatch to REST server backend or local state architecture
      this.persistDataChange("/api/logs", "POST", newLog);
      if (status === "taken" && targetMed) {
        this.persistDataChange(`/api/medications/${medId}`, "PUT", targetMed);
      }
    } else if (status === "snooze") {
      const snoozeMinutes = parseInt(this.settings.snoozeMinutes) || 10;
      const futureDate = new Date(now.getTime() + snoozeMinutes * 60000);
      const snoozeTargetTotalMinutes = futureDate.getHours() * 60 + futureDate.getMinutes();
      
      this.snoozes[`${medId}_${scheduledTime}`] = snoozeTargetTotalMinutes;
    }

    this.activeAlarm = null;
    this.saveLocal();
    this.renderAll();
  }

  async persistDataChange(endpoint, method, payload) {
    this.saveLocal(); // Ensure LocalStorage cache reflects immediate change safely first
    if (!this.isBackendOnline) return;

    try {
      await fetch(`${this.apiBase}${endpoint}`, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.error(`Failed upstream write execution request against backend pipeline: ${endpoint}`, e);
    }
  }

  // --- INITIALIZATION INTERFACES ---
  initDOM() {
    // Structural DOM query hooks inside constructor layout pattern
    const modalMarkup = `
      <div id="alarmModal" class="hidden fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 text-center border-t-4 border-indigo-600 animate-bounce-short">
          <div class="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <h3 id="alarmTitle" class="text-xl font-bold text-slate-900 mb-2"></h3>
          <p id="alarmDetails" class="text-sm text-slate-600 mb-6"></p>
          <div class="grid grid-cols-3 gap-2">
            <button id="btnAlarmTake" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition-colors">Take</button>
            <button id="btnAlarmSnooze" class="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors">Snooze</button>
            <button id="btnAlarmSkip" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-semibold transition-colors">Skip</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalMarkup);
  }

  setupEventListeners() {
    document.getElementById("btnAlarmTake")?.addEventListener("click", () => this.dismissAlarm("taken"));
    document.getElementById("btnAlarmSnooze")?.addEventListener("click", () => this.dismissAlarm("snooze"));
    document.getElementById("btnAlarmSkip")?.addEventListener("click", () => this.dismissAlarm("missed"));
    
    // Explicit click to unlock Web Audio framework limitations securely
    window.addEventListener("click", () => this.ensureAudioUnlocked(), { once: true });
  }

  renderAll() {
    // Layout and list updates go here to modify state dashboard representations
    console.log("Rendering app data...", { medications: this.medications.length, logs: this.logs.length });
  }
}

// Instantiate the application layer
window.addEventListener("DOMContentLoaded", () => {
  window.app = new MedicineTrackerApp();
});
