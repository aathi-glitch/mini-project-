/**
 * MediPulse - Smart Medicine Reminder & Tracker (Full-Stack Client)
 * Synchronizes with Ruby (Sinatra / WEBrick / Pure Ruby) Backend REST APIs when online,
 * with graceful fallback to browser LocalStorage when running offline or via file://.
 */

const DEFAULT_MEDICATIONS = [
  {
    id: "med_1",
    name: "Metformin",
    dosage: "500 mg",
    form: "Tablet",
    color: "indigo",
    foodCondition: "With Food",
    times: ["08:30", "19:30"],
    stock: 28,
    lowThreshold: 10,
    notes: "Take immediately with main meals to reduce GI sensitivity."
  },
  {
    id: "med_2",
    name: "Lisinopril",
    dosage: "10 mg",
    form: "Tablet",
    color: "emerald",
    foodCondition: "Before Food",
    times: ["09:00"],
    stock: 14,
    lowThreshold: 7,
    notes: "Blood pressure management. Take consistently every morning."
  },
  {
    id: "med_3",
    name: "Vitamin D3",
    dosage: "2000 IU",
    form: "Capsule",
    color: "amber",
    foodCondition: "With Food",
    times: ["13:00"],
    stock: 3,
    lowThreshold: 5,
    notes: "Fat-soluble vitamin. Best absorbed with healthy dietary fats."
  },
  {
    id: "med_4",
    name: "Atorvastatin",
    dosage: "20 mg",
    form: "Tablet",
    color: "purple",
    foodCondition: "After Food",
    times: ["21:30"],
    stock: 22,
    lowThreshold: 7,
    notes: "Take at bedtime. Avoid drinking grapefruit juice."
  }
];

class MedicineTrackerApp {
  constructor() {
    this.storageKeyMeds = "medipulse_medications_v1";
    this.storageKeyLogs = "medipulse_dose_logs_v1";
    this.storageKeySettings = "medipulse_settings_v1";

    this.isBackendOnline = false;
    this.apiBase = window.location.origin.startsWith("http") ? "" : "http://localhost:8000";

    // Local cached state
    this.medications = this.loadLocal(this.storageKeyMeds, DEFAULT_MEDICATIONS);
    this.logs = this.loadLocal(this.storageKeyLogs, this.generateInitialLogs());
    this.settings = this.loadLocal(this.storageKeySettings, {
      soundTone: "chime",
      snoozeMinutes: 10,
      caregiverContact: "+1 (555) 234-8790 (Dr. Evelyn Reed)",
      notificationsEnabled: false
    });

    // Make sure older saved settings also get the new property
    if (typeof this.settings.notificationsEnabled !== "boolean") {
      this.settings.notificationsEnabled = false;
    }

    this.activeAlarm = null;
    this.snoozes = {};
    this.audioCtx = null;
    this.alarmAudioInterval = null;

    this.initDOM();
    this.initAudio();
    this.setupEventListeners();
    this.renderAll();

    // Check backend server connection
    this.checkBackendConnection();

    // Run clock & alarm check every second
    setInterval(() => this.tick(), 1000);
  }

  // --- BACKEND API SYNCHRONIZATION ---
  async checkBackendConnection() {
    const badge = document.getElementById("backendBadge");
    const dot = document.getElementById("backendStatusDot");
    const badgeText = document.getElementById("backendBadgeText");

    try {
      const res = await fetch(`${this.apiBase}/api/status`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        this.isBackendOnline = true;

        if (dot && badgeText) {
          dot.className = "w-2 h-2 rounded-full bg-emerald-500";
          badgeText.textContent = `Backend Connected (${data.database || data.engine || "REST API"})`;
          badge.className = "hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200";
        }

        // Fetch fresh data from backend database
        await this.syncFromBackend();
        return;
      }
    } catch (e) {
      // Backend not running; running in client-only/LocalStorage mode
    }

    this.isBackendOnline = false;
    if (dot && badgeText) {
      dot.className = "w-2 h-2 rounded-full bg-amber-400";
      badgeText.textContent = "Offline / Local Mode";
      badge.className = "hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-50 text-amber-700 border border-amber-200";
      badge.title = "Run 'ruby server.rb' or 'bundle exec ruby app.rb' to connect the Ruby REST backend.";
    }
  }

  async syncFromBackend() {
    try {
      const [resMeds, resLogs, resSettings] = await Promise.all([
        fetch(`${this.apiBase}/api/medications`),
        fetch(`${this.apiBase}/api/logs`),
        fetch(`${this.apiBase}/api/settings`)
      ]);

      if (resMeds.ok) this.medications = await resMeds.json();
      if (resLogs.ok) this.logs = await resLogs.json();
      if (resSettings.ok) {
        const s = await resSettings.json();
        if (s && Object.keys(s).length > 0) this.settings = { ...this.settings, ...s };
      }

      this.saveLocal();
      this.renderAll();
    } catch (err) {
      console.warn("Could not sync from backend:", err);
    }
  }

  // --- LOCAL CACHE HELPERS ---
  loadLocal(key, fallback) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  saveLocal() {
    try {
      localStorage.setItem(this.storageKeyMeds, JSON.stringify(this.medications));
      localStorage.setItem(this.storageKeyLogs, JSON.stringify(this.logs));
      localStorage.setItem(this.storageKeySettings, JSON.stringify(this.settings));
    } catch (e) { }
  }

  generateInitialLogs() {
    const logs = [];
    const now = new Date();
    for (let i = 5; i >= 1; i--) {
      const date = new Date(now);
      date.setDate(now.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];

      logs.push({
        id: "log_" + Math.random().toString(36).substr(2, 9),
        medId: "med_1",
        medName: "Metformin",
        dosage: "500 mg",
        scheduledTime: "08:30",
        date: dateStr,
        timestamp: `${dateStr} 08:34:10`,
        status: "taken"
      });

      logs.push({
        id: "log_" + Math.random().toString(36).substr(2, 9),
        medId: "med_2",
        medName: "Lisinopril",
        dosage: "10 mg",
        scheduledTime: "09:00",
        date: dateStr,
        timestamp: `${dateStr} 09:05:00`,
        status: i === 3 ? "missed" : "taken"
      });
    }
    return logs;
  }

  // --- WEB AUDIO API SYNTHESIZER ---
  initAudio() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      this.audioCtx = new AudioContextClass();
    }
  }

  ensureAudioUnlocked() {
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
  }

  playSynthesizedAlarm(toneType = null) {
    this.ensureAudioUnlocked();
    if (!this.audioCtx) return;

    const tone = toneType || this.settings.soundTone || "chime";
    const ctx = this.audioCtx;
    const now = ctx.currentTime;

    if (tone === "chime") {
      const freqs = [523.25, 659.25, 783.99, 1046.5];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);

        gain.gain.setValueAtTime(0, now + idx * 0.12);
        gain.gain.linearRampToValueAtTime(0.25, now + idx * 0.12 + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 0.7);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.75);
      });
    } else if (tone === "beep") {
      [0, 0.18, 0.36].forEach((startOffset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(880, now + startOffset);

        gain.gain.setValueAtTime(0, now + startOffset);
        gain.gain.linearRampToValueAtTime(0.15, now + startOffset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + 0.1);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + startOffset);
        osc.stop(now + startOffset + 0.12);
      });
    } else if (tone === "urgent") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(700, now);
      osc.frequency.linearRampToValueAtTime(1050, now + 0.25);
      osc.frequency.linearRampToValueAtTime(700, now + 0.5);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.6);
    } else if (tone === "zen") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(440, now);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 1.65);
    }
  }

  startAlarmAudioLoop() {
    this.stopAlarmAudioLoop();
    this.playSynthesizedAlarm();
    this.alarmAudioInterval = setInterval(() => {
      this.playSynthesizedAlarm();
    }, 3500);
  }

  stopAlarmAudioLoop() {
    if (this.alarmAudioInterval) {
      clearInterval(this.alarmAudioInterval);
      this.alarmAudioInterval = null;
    }
  }

  // --- SYSTEM PUSH NOTIFICATIONS ---
  async requestNotificationPermission() {
    // Browser does not support notifications
    if (!("Notification" in window)) {
      this.showToast("Push notifications are not supported on this browser.");
      return;
    }

    // If alerts are currently ON → turn them OFF
    if (this.settings.notificationsEnabled === true) {
      this.settings.notificationsEnabled = false;

      this.saveLocal();
      this.updateNotificationButtonState();

      this.showToast("Alerts disabled.");
      return;
    }

    // Browser has already granted permission
    if (Notification.permission === "granted") {
      this.settings.notificationsEnabled = true;

      this.saveLocal();
      this.updateNotificationButtonState();

      this.showToast("Alerts enabled! You'll receive pill reminders.");

      return;
    }

    // Browser permission was previously denied
    if (Notification.permission === "denied") {
      this.showToast(
        "Notifications are blocked. Please allow them in your browser settings."
      );

      this.updateNotificationButtonState();
      return;
    }

    // Ask browser for permission
    const permission = await Notification.requestPermission();

    if (permission === "granted") {
      this.settings.notificationsEnabled = true;

      this.saveLocal();
      this.updateNotificationButtonState();

      this.showToast("Notifications enabled! You'll receive pill reminders.");

      // Test notification
      new Notification("MediPulse Reminders Active", {
        body: "Smart notifications will alert you when it's time to take your medicine.",
        icon: "https://cdn-icons-png.flaticon.com/512/883/883407.png"
      });
    } else {
      this.settings.notificationsEnabled = false;

      this.saveLocal();
      this.updateNotificationButtonState();

      this.showToast("Notifications were not enabled.");
    }
  }

  // --- CLOCK & SCHEDULER ENGINE ---
  tick() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    const currentTimeStr = `${hours}:${minutes}`;

    const liveClockEl = document.getElementById("liveClock");
    if (liveClockEl) {
      liveClockEl.textContent = `${hours}:${minutes}:${seconds}`;
    }

    this.updateNextDoseBanner(now);
    this.checkScheduledAlarms(now, currentTimeStr);
  }

  checkScheduledAlarms(now, currentTimeStr) {
    const todayStr = now.toISOString().split("T")[0];
    const currentTimestamp = now.getTime();

    for (const med of this.medications) {
      for (const time of med.times) {
        const scheduleKey = `${med.id}_${time}`;

        const alreadyLoggedToday = this.logs.some(
          (l) => l.medId === med.id && l.scheduledTime === time && l.date === todayStr && (l.status === "taken" || l.status === "skipped")
        );

        if (alreadyLoggedToday) continue;

        const snoozeExpiry = this.snoozes[scheduleKey];
        const isSnoozeExpired = snoozeExpiry && currentTimestamp >= snoozeExpiry;
        const isScheduledDue = (currentTimeStr === time && (!snoozeExpiry || currentTimestamp >= snoozeExpiry));

        if ((isScheduledDue || isSnoozeExpired) && (!this.activeAlarm || this.activeAlarm.scheduleKey !== scheduleKey)) {
          this.triggerAlarmModal(med, time, scheduleKey);
          return;
        }
      }
    }
  }

  triggerAlarmModal(med, time, scheduleKey) {
    this.activeAlarm = { med, time, scheduleKey };

    document.getElementById("alarmMedName").textContent = med.name;
    document.getElementById("alarmMedDetails").textContent = `${med.dosage} • ${med.form} • ${med.foodCondition}`;
    document.getElementById("alarmMedTime").textContent = time;
    document.getElementById("alarmMedNotes").textContent = med.notes || "Follow doctor prescription";
    document.getElementById("alarmMedStock").textContent = `${med.stock} pills remaining`;

    document.getElementById("alarmOverlay").classList.remove("hidden");
    this.startAlarmAudioLoop();
    this.triggerSystemPushNotification(med, time);
  }

  dismissAlarmModal() {
    this.stopAlarmAudioLoop();
    document.getElementById("alarmOverlay").classList.add("hidden");
    this.activeAlarm = null;
  }

  // --- ACTIONS: TAKE / SNOOZE / SKIP ---
  async markDoseTaken(medId, scheduledTime, customNotes = "") {
    const med = this.medications.find((m) => m.id === medId);
    if (!med) return;

    if (med.stock > 0) med.stock -= 1;

    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

    const newLog = {
      id: "log_" + Math.random().toString(36).substr(2, 9),
      medId: med.id,
      medName: med.name,
      dosage: med.dosage,
      scheduledTime: scheduledTime,
      date: dateStr,
      timestamp: `${dateStr} ${timeStr}`,
      status: "taken",
      notes: customNotes
    };

    this.logs.unshift(newLog);
    delete this.snoozes[`${medId}_${scheduledTime}`];

    // Backend REST API synchronization
    if (this.isBackendOnline) {
      try {
        await fetch(`${this.apiBase}/api/logs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newLog)
        });
      } catch (e) {
        console.warn("Backend log sync failed, stored locally:", e);
      }
    }

    this.saveLocal();
    this.dismissAlarmModal();
    this.renderAll();

    if (window.confetti) {
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
    }

    this.showToast(`Recorded ${med.name} taken!`);
  }

  snoozeDose(medId, scheduledTime) {
    const snoozeMinutes = parseInt(this.settings.snoozeMinutes, 10) || 10;
    const snoozeUntil = Date.now() + snoozeMinutes * 60 * 1000;
    this.snoozes[`${medId}_${scheduledTime}`] = snoozeUntil;

    this.dismissAlarmModal();
    this.renderAll();
    this.showToast(`Snoozed for ${snoozeMinutes} minutes.`);
  }

  async skipDose(medId, scheduledTime) {
    const med = this.medications.find((m) => m.id === medId);
    if (!med) return;

    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    const newLog = {
      id: "log_" + Math.random().toString(36).substr(2, 9),
      medId: med.id,
      medName: med.name,
      dosage: med.dosage,
      scheduledTime: scheduledTime,
      date: dateStr,
      timestamp: `${dateStr} ${timeStr}`,
      status: "skipped",
      notes: "Dose skipped by user"
    };

    this.logs.unshift(newLog);
    delete this.snoozes[`${medId}_${scheduledTime}`];

    if (this.isBackendOnline) {
      try {
        await fetch(`${this.apiBase}/api/logs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newLog)
        });
      } catch (e) { }
    }

    this.saveLocal();
    this.dismissAlarmModal();
    this.renderAll();
    this.showToast(`Dose marked as skipped for ${med.name}.`);
  }

  // --- COUNTDOWN BANNER ---
  updateNextDoseBanner(now) {
    const todayStr = now.toISOString().split("T")[0];
    const currentMins = now.getHours() * 60 + now.getMinutes();

    let upcomingList = [];
    this.medications.forEach((med) => {
      med.times.forEach((t) => {
        const [h, m] = t.split(":").map(Number);
        const slotMins = h * 60 + m;

        const isCompleted = this.logs.some(
          (l) => l.medId === med.id && l.scheduledTime === t && l.date === todayStr && l.status === "taken"
        );

        if (!isCompleted) {
          upcomingList.push({
            med,
            timeStr: t,
            slotMins,
            diffMins: slotMins - currentMins
          });
        }
      });
    });

    upcomingList.sort((a, b) => a.slotMins - b.slotMins);
    const nextDose = upcomingList.find((item) => item.diffMins >= 0) || upcomingList[0];

    const titleEl = document.getElementById("nextDoseTitle");
    const detailsEl = document.getElementById("nextDoseDetails");
    const countdownEl = document.getElementById("nextDoseCountdown");
    const quickTakeBtn = document.getElementById("btnQuickTakeNext");

    if (!nextDose) {
      titleEl.textContent = "All Done for Today!";
      detailsEl.textContent = "You've successfully taken all scheduled doses.";
      countdownEl.textContent = "00:00:00";
      quickTakeBtn.classList.add("hidden");
      return;
    }

    titleEl.textContent = `${nextDose.med.name} (${nextDose.med.dosage})`;
    detailsEl.textContent = `Scheduled for ${nextDose.timeStr} • ${nextDose.med.foodCondition} • Stock: ${nextDose.med.stock}`;
    quickTakeBtn.classList.remove("hidden");
    quickTakeBtn.onclick = () => this.markDoseTaken(nextDose.med.id, nextDose.timeStr);

    const [targetH, targetM] = nextDose.timeStr.split(":").map(Number);
    const targetDate = new Date(now);
    targetDate.setHours(targetH, targetM, 0, 0);

    let diffMs = targetDate.getTime() - now.getTime();
    if (diffMs < 0) {
      countdownEl.textContent = "DUE NOW";
      countdownEl.classList.add("text-amber-300");
    } else {
      countdownEl.classList.remove("text-amber-300");
      const hrs = Math.floor(diffMs / (1000 * 60 * 60));
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diffMs % (1000 * 60)) / 1000);
      countdownEl.textContent = `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }
  }

  // --- RENDERING VIEWS ---
  renderAll() {
    this.renderTodaySchedule();
    this.renderCabinetInventory();
    this.renderAdherenceAndLogs();
    this.renderAIInteractions();
    this.renderSettingsValues();
    if (window.lucide) lucide.createIcons();
  }

  renderTodaySchedule() {
    const todayStr = new Date().toISOString().split("T")[0];

    const slotMorning = document.getElementById("slot-morning");
    const slotAfternoon = document.getElementById("slot-afternoon");
    const slotEvening = document.getElementById("slot-evening");
    const slotNight = document.getElementById("slot-night");

    slotMorning.innerHTML = "";
    slotAfternoon.innerHTML = "";
    slotEvening.innerHTML = "";
    slotNight.innerHTML = "";

    let totalToday = 0;
    let takenToday = 0;
    let pendingToday = 0;

    const doses = [];
    this.medications.forEach((med) => {
      med.times.forEach((t) => {
        totalToday++;
        const log = this.logs.find((l) => l.medId === med.id && l.scheduledTime === t && l.date === todayStr);
        const isSnoozed = !!this.snoozes[`${med.id}_${t}`];

        let status = "pending";
        if (log) {
          status = log.status;
          if (status === "taken") takenToday++;
        } else if (isSnoozed) {
          status = "snoozed";
          pendingToday++;
        } else {
          pendingToday++;
        }

        doses.push({ med, time: t, status });
      });
    });

    document.getElementById("statTotalDoses").textContent = totalToday;
    document.getElementById("statTakenDoses").textContent = takenToday;
    document.getElementById("statPendingDoses").textContent = pendingToday;
    document.getElementById("badgePendingCount").textContent = pendingToday;

    const streak = this.calculateStreak();
    document.getElementById("statStreakDays").textContent = `${streak} ${streak === 1 ? "Day" : "Days"}`;

    doses.forEach(({ med, time, status }) => {
      const [h] = time.split(":").map(Number);
      const card = this.createDoseCard(med, time, status);

      if (h >= 5 && h < 12) slotMorning.appendChild(card);
      else if (h >= 12 && h < 17) slotAfternoon.appendChild(card);
      else if (h >= 17 && h < 21) slotEvening.appendChild(card);
      else slotNight.appendChild(card);
    });

    [
      { el: slotMorning, label: "morning" },
      { el: slotAfternoon, label: "afternoon" },
      { el: slotEvening, label: "evening" },
      { el: slotNight, label: "bedtime" }
    ].forEach(({ el, label }) => {
      if (el.children.length === 0) {
        el.innerHTML = `
          <div class="col-span-full py-4 px-4 bg-white/60 border border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs text-center flex items-center justify-center gap-2">
            <i data-lucide="sun" class="w-4 h-4"></i> No medications scheduled for ${label}.
          </div>
        `;
      }
    });
  }

  createDoseCard(med, time, status) {
    const card = document.createElement("div");
    card.className = `med-card bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between ${status === "taken"
      ? "status-taken bg-slate-50/70"
      : status === "snoozed"
        ? "status-snoozed"
        : "status-due"
      }`;

    const isTaken = status === "taken";
    const isSnoozed = status === "snoozed";

    card.innerHTML = `
      <div>
        <div class="flex items-start justify-between gap-2 mb-2">
          <div class="flex items-center gap-2">
            <span class="w-7 h-7 rounded-xl badge-color-${med.color} flex items-center justify-center font-bold text-xs shrink-0">
              <i data-lucide="pill" class="w-4 h-4"></i>
            </span>
            <div>
              <h4 class="font-bold text-slate-800 text-sm ${isTaken ? 'line-through text-slate-400' : ''}">${med.name}</h4>
              <p class="text-xs text-slate-500">${med.dosage} • ${med.form}</p>
            </div>
          </div>
          <span class="px-2 py-0.5 text-xs font-mono font-bold rounded-lg ${isTaken
        ? 'bg-emerald-100 text-emerald-800'
        : isSnoozed
          ? 'bg-indigo-100 text-indigo-700'
          : 'bg-amber-100 text-amber-800'
      }">
            ${time}
          </span>
        </div>

        <div class="bg-slate-50 rounded-xl p-2.5 my-2 text-xs space-y-1 text-slate-600">
          <div class="flex items-center gap-1.5">
            <i data-lucide="utensils" class="w-3.5 h-3.5 text-slate-400"></i>
            <span>${med.foodCondition}</span>
          </div>
          ${med.notes ? `
            <div class="flex items-center gap-1.5 text-slate-500 text-[11px] truncate" title="${med.notes}">
              <i data-lucide="info" class="w-3.5 h-3.5 text-slate-400 shrink-0"></i>
              <span class="truncate">${med.notes}</span>
            </div>
          ` : ''}
        </div>
      </div>

      <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 mt-2">
        <span class="text-[11px] text-slate-400 font-medium">Stock: ${med.stock} left</span>
        <div class="flex items-center gap-1.5">
          ${isTaken
        ? `<span class="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                  <i data-lucide="check" class="w-3.5 h-3.5"></i> Taken
                </span>`
        : `
                <button class="btn-card-take px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1">
                  <i data-lucide="check" class="w-3.5 h-3.5"></i> Take
                </button>
                <button class="btn-card-snooze p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg transition" title="Snooze 10m">
                  <i data-lucide="clock" class="w-3.5 h-3.5"></i>
                </button>
              `
      }
        </div>
      </div>
    `;

    const takeBtn = card.querySelector(".btn-card-take");
    if (takeBtn) takeBtn.onclick = () => this.markDoseTaken(med.id, time);

    const snoozeBtn = card.querySelector(".btn-card-snooze");
    if (snoozeBtn) snoozeBtn.onclick = () => this.snoozeDose(med.id, time);

    return card;
  }

  // --- TAB 2: INVENTORY ---
  renderCabinetInventory() {
    const grid = document.getElementById("inventoryGrid");
    const searchVal = (document.getElementById("inventorySearch").value || "").toLowerCase();
    grid.innerHTML = "";

    let lowStockCount = 0;
    const filtered = this.medications.filter(
      (m) => m.name.toLowerCase().includes(searchVal) || m.dosage.toLowerCase().includes(searchVal)
    );

    filtered.forEach((med) => {
      const isLow = med.stock <= med.lowThreshold;
      if (isLow) lowStockCount++;

      const card = document.createElement("div");
      card.className = "bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between";

      const maxVisualStock = Math.max(med.stock, 30);
      const stockPercent = Math.min(100, Math.round((med.stock / maxVisualStock) * 100));

      card.innerHTML = `
        <div>
          <div class="flex items-start justify-between mb-3">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-2xl badge-color-${med.color} flex items-center justify-center font-bold">
                <i data-lucide="pill" class="w-5 h-5"></i>
              </div>
              <div>
                <h3 class="font-bold text-slate-800 text-base">${med.name}</h3>
                <p class="text-xs text-slate-400 font-medium">${med.dosage} • ${med.form}</p>
              </div>
            </div>
            ${isLow
          ? `<span class="px-2 py-0.5 text-xs font-bold rounded-full bg-rose-100 text-rose-800 border border-rose-200 animate-pulse">Low Stock</span>`
          : `<span class="px-2 py-0.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800">In Stock</span>`
        }
          </div>

          <div class="space-y-2 mb-4">
            <div class="flex items-center justify-between text-xs">
              <span class="text-slate-500">Remaining Pills:</span>
              <span class="font-bold text-sm ${isLow ? 'text-rose-600' : 'text-slate-800'}">${med.stock} pills</span>
            </div>
            <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div class="h-2 rounded-full ${isLow ? 'bg-rose-500' : 'bg-emerald-500'} transition-all" style="width: ${stockPercent}%"></div>
            </div>
            <div class="flex justify-between text-[11px] text-slate-400">
              <span>Threshold: ${med.lowThreshold} pills</span>
              <span>Times: ${med.times.join(", ")}</span>
            </div>
          </div>

          <div class="bg-slate-50 rounded-xl p-3 text-xs text-slate-600 space-y-1 mb-4">
            <p><span class="font-semibold text-slate-700">Food:</span> ${med.foodCondition}</p>
            ${med.notes ? `<p><span class="font-semibold text-slate-700">Advice:</span> ${med.notes}</p>` : ""}
          </div>
        </div>

        <div class="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
          <button class="btn-restock px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1">
            <i data-lucide="plus" class="w-3.5 h-3.5"></i> Refill +10
          </button>
          <div class="flex items-center gap-1">
            <button class="btn-edit-med p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition" title="Edit Medication">
              <i data-lucide="edit-3" class="w-4 h-4"></i>
            </button>
            <button class="btn-delete-med p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition" title="Delete Medication">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      `;

      // Refill Handler
      card.querySelector(".btn-restock").onclick = async () => {
        med.stock += 10;
        if (this.isBackendOnline) {
          try {
            await fetch(`${this.apiBase}/api/medications/${med.id}/refill`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ amount: 10 })
            });
          } catch (e) { }
        }
        this.saveLocal();
        this.renderAll();
        this.showToast(`Refilled +10 to ${med.name}. Total: ${med.stock}`);
      };

      card.querySelector(".btn-edit-med").onclick = () => this.openEditModal(med);

      card.querySelector(".btn-delete-med").onclick = async () => {
        if (confirm(`Remove ${med.name} from your prescriptions?`)) {
          this.medications = this.medications.filter((m) => m.id !== med.id);
          if (this.isBackendOnline) {
            try {
              await fetch(`${this.apiBase}/api/medications/${med.id}`, { method: "DELETE" });
            } catch (e) { }
          }
          this.saveLocal();
          this.renderAll();
          this.showToast(`Removed ${med.name}`);
        }
      };

      grid.appendChild(card);
    });

    const lowBadge = document.getElementById("badgeLowStockCount");
    if (lowStockCount > 0) {
      lowBadge.textContent = lowStockCount;
      lowBadge.classList.remove("hidden");
    } else {
      lowBadge.classList.add("hidden");
    }
  }

  // --- TAB 3: ADHERENCE & LOGS ---
  renderAdherenceAndLogs() {
    const totalTaken = this.logs.filter((l) => l.status === "taken").length;
    const totalLogged = this.logs.length;
    const score = totalLogged > 0 ? Math.round((totalTaken / totalLogged) * 100) : 100;

    document.getElementById("adherencePercent").textContent = `${score}%`;
    document.getElementById("adherenceProgressBar").style.width = `${score}%`;

    const scoreBadgeEl = document.getElementById("scoreBadge");
    if (score >= 90) {
      scoreBadgeEl.textContent = "Excellent";
      scoreBadgeEl.className = "px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800";
    } else if (score >= 75) {
      scoreBadgeEl.textContent = "Good";
      scoreBadgeEl.className = "px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800";
    } else {
      scoreBadgeEl.textContent = "Needs Attention";
      scoreBadgeEl.className = "px-2 py-0.5 text-xs font-semibold rounded-full bg-rose-100 text-rose-800";
    }

    const weeklyRow = document.getElementById("weeklyHistoryRow");
    weeklyRow.innerHTML = "";

    const daysName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const dayName = daysName[d.getDay()];

      const dayLogs = this.logs.filter((l) => l.date === dateStr);
      let dayColor = "bg-slate-100 text-slate-400";
      let statusIcon = "minus";

      if (dayLogs.length > 0) {
        const missed = dayLogs.some((l) => l.status === "missed");
        const taken = dayLogs.filter((l) => l.status === "taken").length;

        if (missed) {
          dayColor = "bg-rose-100 text-rose-700 border-rose-300";
          statusIcon = "alert-circle";
        } else if (taken > 0) {
          dayColor = "bg-emerald-100 text-emerald-700 border-emerald-300";
          statusIcon = "check";
        }
      }

      const dayCol = document.createElement("div");
      dayCol.className = "flex flex-col items-center gap-1.5";
      dayCol.innerHTML = `
        <span class="text-xs text-slate-400 font-medium">${dayName}</span>
        <div class="w-10 h-10 rounded-2xl flex items-center justify-center font-bold border ${dayColor}">
          <i data-lucide="${statusIcon}" class="w-4 h-4"></i>
        </div>
        <span class="text-[10px] text-slate-500 font-mono">${d.getDate()}</span>
      `;
      weeklyRow.appendChild(dayCol);
    }

    const tbody = document.getElementById("historyTableBody");
    tbody.innerHTML = "";

    if (this.logs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="py-6 text-center text-slate-400 text-xs">No dose history recorded yet.</td>
        </tr>
      `;
      return;
    }

    this.logs.slice(0, 15).forEach((log) => {
      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-50/50 transition";

      const badge =
        log.status === "taken"
          ? `<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">Taken</span>`
          : log.status === "snoozed"
            ? `<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">Snoozed</span>`
            : `<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">Skipped/Missed</span>`;

      tr.innerHTML = `
        <td class="py-3 px-4 text-xs font-mono text-slate-600">${log.timestamp || log.date}</td>
        <td class="py-3 px-4 font-bold text-slate-800 text-xs">${log.medName} <span class="font-normal text-slate-400">(${log.dosage})</span></td>
        <td class="py-3 px-4 text-xs font-mono text-slate-600">${log.scheduledTime}</td>
        <td class="py-3 px-4">${badge}</td>
        <td class="py-3 px-4 text-xs text-slate-500">${log.notes || "—"}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  calculateStreak() {
    let streak = 0;
    const now = new Date();

    for (let i = 0; i < 30; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];

      const dayLogs = this.logs.filter((l) => l.date === dateStr);
      if (dayLogs.length === 0) {
        if (i === 0) continue;
        break;
      }

      const hasTaken = dayLogs.some((l) => l.status === "taken");
      const hasMissed = dayLogs.some((l) => l.status === "missed");

      if (hasTaken && !hasMissed) streak++;
      else break;
    }
    return streak;
  }

  // --- TAB 4: AI HEALTH & INTERACTION ASSISTANT ---
  async renderAIInteractions() {
    const container = document.getElementById("aiInteractionResults");
    if (!container) return;

    let detected = [];

    // Use backend safety audit if online
    if (this.isBackendOnline) {
      try {
        const res = await fetch(`${this.apiBase}/api/ai/audit`, { method: "POST" });
        if (res.ok) {
          const audit = await res.json();
          detected = audit.conflicts || [];
        }
      } catch (e) { }
    }

    if (detected.length === 0) {
      const medNames = this.medications.map((m) => m.name.toLowerCase());
      const fallbackRules = [
        {
          check: () =>
            medNames.some((m) => /(lisinopril|enalapril|ramipril|losartan|valsartan)/.test(m)) &&
            medNames.some((m) => /(potassium|spironolactone|triamterene|amiloride)/.test(m)),
          severity: "high",
          title: "Hyperkalemia Hazard (ACE Inhibitors / ARBs + Potassium)",
          desc: "Co-administering ACE inhibitors or ARBs with potassium supplements or potassium-sparing diuretics may dangerously elevate serum potassium, risking cardiac arrhythmia."
        },
        {
          check: () =>
            medNames.some((m) => /(warfarin|coumadin|apixaban|eliquis|rivaroxaban|clopidogrel|plavix|aspirin)/.test(m)) &&
            medNames.some((m) => /(ibuprofen|advil|motrin|naproxen|aleve|meloxicam|celecoxib|diclofenac)/.test(m)),
          severity: "high",
          title: "Major Hemorrhage Risk (Blood Thinners + NSAIDs)",
          desc: "Concomitant use of anticoagulants/antiplatelets and NSAIDs significantly elevates gastrointestinal bleeding and ulceration hazards."
        },
        {
          check: () =>
            medNames.some((m) => /(sertraline|zoloft|fluoxetine|prozac|escitalopram|lexapro|citalopram|venlafaxine|duloxetine)/.test(m)) &&
            medNames.some((m) => /(tramadol|st\.?\s*john|dextromethorphan|linezolid)/.test(m)),
          severity: "high",
          title: "Serotonin Toxicity Risk (SSRIs/SNRIs + Serotonergic Agents)",
          desc: "Concurrent serotonergic agents can trigger serotonin syndrome (hyperthermia, neuromuscular clonus, and autonomic dysfunction)."
        },
        {
          check: () =>
            medNames.some((m) => /(oxycodone|hydrocodone|morphine|codeine|tramadol|fentanyl)/.test(m)) &&
            medNames.some((m) => /(alprazolam|xanax|lorazepam|ativan|diazepam|valium|clonazepam|zolpidem|ambien)/.test(m)),
          severity: "high",
          title: "Profound CNS & Respiratory Depression (Opioids + Sedatives)",
          desc: "Combining opioids with benzodiazepines or sleep aids causes additive CNS depression and life-threatening respiratory sedation."
        },
        {
          check: () =>
            medNames.some((m) => /(levothyroxine|synthroid|euthyrox)/.test(m)) &&
            medNames.some((m) => /(calcium|iron|ferrous|magnesium|antacid|tums)/.test(m)),
          severity: "medium",
          title: "Thyroid Hormone Chelation (Levothyroxine + Polyvalent Minerals)",
          desc: "Calcium, iron, magnesium, and antacids chelate levothyroxine in the GI tract. Administer at least 4 hours apart."
        },
        {
          check: () => medNames.some((m) => m.includes("metformin")) && medNames.some((m) => /(alcohol|ethanol|wine|beer)/.test(m)),
          severity: "medium",
          title: "Metformin & Alcohol Contraindication",
          desc: "Alcohol potentiation during metformin therapy substantially increases the risk of lactic acidosis and acute hypoglycemia."
        },
        {
          check: () =>
            medNames.some((m) => /(lisinopril|losartan|enalapril|valsartan)/.test(m)) &&
            medNames.some((m) => /(ibuprofen|advil|naproxen|aleve)/.test(m)),
          severity: "medium",
          title: "Renal Perfusion Impairment (ACEi/ARBs + NSAIDs)",
          desc: "NSAIDs attenuate the antihypertensive benefits of ACE inhibitors/ARBs and may precipitate acute kidney injury."
        },
        {
          check: () => medNames.some((m) => /(atorvastatin|lipitor|simvastatin|zocor|lovastatin)/.test(m)),
          severity: "info",
          title: "Statin Metabolism & Grapefruit Advisory",
          desc: "Grapefruit inhibits intestinal CYP3A4 metabolism, drastically elevating statin plasma levels and myopathy risk."
        }
      ];
      detected = fallbackRules.filter((r) => r.check());
    }

    container.innerHTML = "";

    if (detected.length === 0) {
      container.innerHTML = `
        <div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-start gap-4 text-emerald-900">
          <div class="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <i data-lucide="shield-check" class="w-6 h-6"></i>
          </div>
          <div>
            <h4 class="font-bold text-sm">No Major Drug-to-Drug Conflicts Found</h4>
            <p class="text-xs text-emerald-800 mt-1">
              Your ${this.medications.length} active prescriptions currently pass standard interaction checks.
            </p>
          </div>
        </div>
      `;
      return;
    }

    detected.forEach((item) => {
      const colorClasses =
        item.severity === "high"
          ? "bg-rose-50 border-rose-200 text-rose-900"
          : item.severity === "medium"
            ? "bg-amber-50 border-amber-200 text-amber-900"
            : "bg-indigo-50 border-indigo-200 text-indigo-900";

      const badgeColor =
        item.severity === "high"
          ? "bg-rose-100 text-rose-800"
          : item.severity === "medium"
            ? "bg-amber-100 text-amber-800"
            : "bg-indigo-100 text-indigo-800";

      const iconName = item.severity === "high" ? "alert-triangle" : "info";

      const card = document.createElement("div");
      card.className = `border rounded-2xl p-5 flex items-start gap-4 ${colorClasses}`;
      card.innerHTML = `
        <div class="w-10 h-10 rounded-xl bg-white/80 flex items-center justify-center shrink-0">
          <i data-lucide="${iconName}" class="w-5 h-5"></i>
        </div>
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
            <h4 class="font-bold text-sm">${item.title}</h4>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${badgeColor}">${item.severity}</span>
          </div>
          <p class="text-xs leading-relaxed opacity-90">${item.desc}</p>
        </div>
      `;
      container.appendChild(card);
    });
  }

  // --- TAB 5: SETTINGS ---
  renderSettingsValues() {
    const toneSelect = document.getElementById("settingSoundTone");
    const snoozeSelect = document.getElementById("settingSnoozeMinutes");
    const caregiverInput = document.getElementById("settingCaregiverContact");
    const footerCaregiver = document.getElementById("footerCaregiver");

    if (toneSelect) toneSelect.value = this.settings.soundTone || "chime";
    if (snoozeSelect) snoozeSelect.value = this.settings.snoozeMinutes || 10;
    if (caregiverInput) caregiverInput.value = this.settings.caregiverContact || "";

    if (footerCaregiver) {
      footerCaregiver.textContent = this.settings.caregiverContact
        ? `Caregiver / Doctor: ${this.settings.caregiverContact}`
        : "Emergency / Caregiver: Not configured";
    }

    this.updateNotificationButtonState();
  }

  updateNotificationButtonState() {
    const btn = document.getElementById("btnToggleNotifications");
    const statusText = document.getElementById("notifStatusText");

    if (!btn || !statusText) return;

    // Browser does not support notifications
    if (!("Notification" in window)) {
      statusText.textContent = "Push Unsupported";
      btn.disabled = true;
      btn.className =
        "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-100 text-slate-400 rounded-xl transition";
      return;
    }

    btn.disabled = false;

    // APP ALERTS ARE ON
    if (
      this.settings.notificationsEnabled === true &&
      Notification.permission === "granted"
    ) {
      statusText.textContent = "Alerts Active";

      btn.className =
        "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl transition";

      btn.title = "Click to disable alerts";
      return;
    }

    // Browser permission was denied
    if (Notification.permission === "denied") {
      statusText.textContent = "Alerts Blocked";

      btn.className =
        "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 rounded-xl transition";

      btn.title = "Notifications are blocked in browser settings";
      return;
    }

    // APP ALERTS ARE OFF
    statusText.textContent = "Enable Alerts";

    btn.className =
      "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition";

    btn.title = "Click to enable alerts";
  }

  // --- MODAL: ADD / EDIT ---
  openAddModal() {
    document.getElementById("modalMedTitle").textContent = "Add New Medication";
    document.getElementById("formMedication").reset();
    document.getElementById("medId").value = "";

    const container = document.getElementById("timeSlotsContainer");
    container.innerHTML = "";
    this.addTimeSlotInput("08:00");

    document.getElementById("modalAddMed").classList.remove("hidden");
    if (window.lucide) lucide.createIcons();
  }

  openEditModal(med) {
    document.getElementById("modalMedTitle").textContent = "Edit Medication";
    document.getElementById("medId").value = med.id;
    document.getElementById("medName").value = med.name;
    document.getElementById("medDosage").value = med.dosage;
    document.getElementById("medForm").value = med.form;
    document.getElementById("medColor").value = med.color;
    document.getElementById("medFoodCondition").value = med.foodCondition;
    document.getElementById("medStock").value = med.stock;
    document.getElementById("medLowThreshold").value = med.lowThreshold;
    document.getElementById("medNotes").value = med.notes || "";

    const container = document.getElementById("timeSlotsContainer");
    container.innerHTML = "";
    if (med.times && med.times.length > 0) {
      med.times.forEach((t) => this.addTimeSlotInput(t));
    } else {
      this.addTimeSlotInput("08:00");
    }

    document.getElementById("modalAddMed").classList.remove("hidden");
    if (window.lucide) lucide.createIcons();
  }

  closeModal() {
    document.getElementById("modalAddMed").classList.add("hidden");
  }

  addTimeSlotInput(defaultTime = "08:00") {
    const container = document.getElementById("timeSlotsContainer");
    const row = document.createElement("div");
    row.className = "flex items-center gap-2";
    row.innerHTML = `
      <input type="time" required value="${defaultTime}" class="time-slot-input flex-1 px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
      <button type="button" class="btn-remove-time p-2 text-slate-400 hover:text-rose-600 rounded-xl transition">
        <i data-lucide="trash-2" class="w-4 h-4"></i>
      </button>
    `;

    row.querySelector(".btn-remove-time").onclick = () => {
      if (container.querySelectorAll(".time-slot-input").length > 1) {
        row.remove();
      } else {
        this.showToast("At least one schedule time is required.");
      }
    };

    container.appendChild(row);
    if (window.lucide) lucide.createIcons();
  }

  async handleSaveMedication(e) {
    e.preventDefault();

    const idInput = document.getElementById("medId").value;
    const name = document.getElementById("medName").value.trim();
    const dosage = document.getElementById("medDosage").value.trim();
    const form = document.getElementById("medForm").value;
    const color = document.getElementById("medColor").value;
    const foodCondition = document.getElementById("medFoodCondition").value;
    const stock = parseInt(document.getElementById("medStock").value, 10) || 0;
    const lowThreshold = parseInt(document.getElementById("medLowThreshold").value, 10) || 5;
    const notes = document.getElementById("medNotes").value.trim();

    const timeInputs = document.querySelectorAll(".time-slot-input");
    const times = [];
    timeInputs.forEach((input) => {
      if (input.value && !times.includes(input.value)) {
        times.push(input.value);
      }
    });

    if (times.length === 0) {
      alert("Please specify at least one time slot.");
      return;
    }
    times.sort();

    const medPayload = {
      id: idInput || "med_" + Math.random().toString(36).substr(2, 9),
      name,
      dosage,
      form,
      color,
      foodCondition,
      times,
      stock,
      lowThreshold,
      notes
    };

    if (idInput) {
      // Update
      const index = this.medications.findIndex((m) => m.id === idInput);
      if (index !== -1) this.medications[index] = medPayload;

      if (this.isBackendOnline) {
        try {
          await fetch(`${this.apiBase}/api/medications/${idInput}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(medPayload)
          });
        } catch (e) { }
      }
      this.showToast(`Updated ${name}`);
    } else {
      // Create
      this.medications.push(medPayload);

      if (this.isBackendOnline) {
        try {
          await fetch(`${this.apiBase}/api/medications`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(medPayload)
          });
        } catch (e) { }
      }
      this.showToast(`Added ${name} to prescriptions`);
    }

    this.saveLocal();
    this.closeModal();
    this.renderAll();
  }

  showToast(message) {
    const toast = document.getElementById("toast");
    const msgEl = document.getElementById("toastMsg");
    msgEl.textContent = message;

    toast.classList.remove("translate-y-24", "opacity-0");
    toast.classList.add("translate-y-0", "opacity-100");

    setTimeout(() => {
      toast.classList.remove("translate-y-0", "opacity-100");
      toast.classList.add("translate-y-24", "opacity-0");
    }, 3200);
  }

  // --- INITIALIZATION ---
  initDOM() {
    this.addTimeSlotInput("08:00");
  }

  setupEventListeners() {
    document.querySelectorAll(".nav-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const targetId = tab.getAttribute("data-tab");

        document.querySelectorAll(".nav-tab").forEach((t) => {
          t.classList.remove("border-indigo-600", "text-indigo-600");
          t.classList.add("border-transparent", "text-slate-500");
        });

        tab.classList.add("border-indigo-600", "text-indigo-600");
        tab.classList.remove("border-transparent", "text-slate-500");

        document.querySelectorAll(".tab-pane").forEach((pane) => pane.classList.add("hidden"));
        document.getElementById(targetId).classList.remove("hidden");
        if (window.lucide) lucide.createIcons();
      });
    });

    document.getElementById("btnOpenAddModal").onclick = () => this.openAddModal();
    document.getElementById("btnOpenAddModal2").onclick = () => this.openAddModal();
    document.getElementById("btnCloseMedModal").onclick = () => this.closeModal();
    document.getElementById("btnCancelMed").onclick = () => this.closeModal();
    document.getElementById("btnAddTimeSlot").onclick = () => this.addTimeSlotInput();
    document.getElementById("formMedication").onsubmit = (e) => this.handleSaveMedication(e);

    document.getElementById("btnSoundTest").onclick = () => {
      this.ensureAudioUnlocked();
      this.playSynthesizedAlarm();
      this.showToast(`Sound test played (${this.settings.soundTone})`);
    };

    document.getElementById("btnToggleNotifications").onclick = () => {
      this.requestNotificationPermission();
    };

    document.getElementById("btnAlarmTake").onclick = () => {
      if (this.activeAlarm) this.markDoseTaken(this.activeAlarm.med.id, this.activeAlarm.time);
    };

    document.getElementById("btnAlarmSnooze").onclick = () => {
      if (this.activeAlarm) this.snoozeDose(this.activeAlarm.med.id, this.activeAlarm.time);
    };

    document.getElementById("btnAlarmSkip").onclick = () => {
      if (this.activeAlarm) this.skipDose(this.activeAlarm.med.id, this.activeAlarm.time);
    };

    document.getElementById("inventorySearch").oninput = () => {
      this.renderCabinetInventory();
      if (window.lucide) lucide.createIcons();
    };

    document.getElementById("btnRunSafetyScan").onclick = () => {
      this.renderAIInteractions();
      if (window.lucide) lucide.createIcons();
      this.showToast("Safety audit updated across current medications.");
    };

    document.getElementById("settingSoundTone").onchange = (e) => {
      this.settings.soundTone = e.target.value;
      this.saveSettingsToBackend({ soundTone: e.target.value });
      this.saveLocal();
      this.playSynthesizedAlarm(e.target.value);
    };

    document.getElementById("settingSnoozeMinutes").onchange = (e) => {
      this.settings.snoozeMinutes = parseInt(e.target.value, 10);
      this.saveSettingsToBackend({ snoozeMinutes: e.target.value });
      this.saveLocal();
      this.showToast(`Snooze time updated to ${e.target.value} minutes.`);
    };

    document.getElementById("settingCaregiverContact").onchange = (e) => {
      this.settings.caregiverContact = e.target.value.trim();
      this.saveSettingsToBackend({ caregiverContact: e.target.value.trim() });
      this.saveLocal();
      this.renderSettingsValues();
      this.showToast("Caregiver emergency contact updated.");
    };

    document.getElementById("btnClearLogs").onclick = async () => {
      if (confirm("Clear all dose logs history? This resets adherence statistics.")) {
        this.logs = [];
        if (this.isBackendOnline) {
          try {
            await fetch(`${this.apiBase}/api/logs`, { method: "DELETE" });
          } catch (e) { }
        }
        this.saveLocal();
        this.renderAll();
        this.showToast("Dose logs cleared.");
      }
    };

    document.getElementById("btnExportData").onclick = () => {
      const backup = {
        medications: this.medications,
        logs: this.logs,
        settings: this.settings,
        exportedAt: new Date().toISOString()
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `medipulse_backup_${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast("Prescription and log data exported!");
    };

    document.getElementById("fileImportData").onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const imported = JSON.parse(event.target.result);
          if (imported.medications && Array.isArray(imported.medications)) {
            this.medications = imported.medications;
            this.logs = imported.logs || [];
            this.settings = imported.settings || this.settings;
            this.saveLocal();
            this.renderAll();
            this.showToast("Data imported successfully!");
          }
        } catch (err) {
          alert("Error parsing JSON file.");
        }
      };
      reader.readAsText(file);
    };

    document.getElementById("btnLoadDemoData").onclick = () => {
      if (confirm("Reset medications to default medical demo data?")) {
        this.medications = JSON.parse(JSON.stringify(DEFAULT_MEDICATIONS));
        this.logs = this.generateInitialLogs();
        this.saveLocal();
        this.renderAll();
        this.showToast("Loaded demo medications!");
      }
    };
  }

  async saveSettingsToBackend(data) {
    if (this.isBackendOnline) {
      try {
        await fetch(`${this.apiBase}/api/settings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data)
        });
      } catch (e) { }
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.app = new MedicineTrackerApp();
});
