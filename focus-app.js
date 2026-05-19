document.addEventListener("DOMContentLoaded", () => {
"use strict";

const $ = (id) => document.getElementById(id);
function on(id,event,fn){
  const el = $(id);
  if(el) el.addEventListener(event,fn);
}


const tracks = {
  rain:  { title:"Rain Focus", file:"focus-rain.mp3",  theme:"theme-rain" },
  lofi:  { title:"Lo-fi",      file:"focus-lofi.mp3",  theme:"theme-lofi" },
  piano: { title:"Piano",      file:"focus-piano.mp3", theme:"theme-piano" },
  relax: { title:"Relax",      file:"focus-relax.mp3", theme:"theme-relax" },
  jazz:  { title:"Jazz",       file:"focus-jazz.mp3",  theme:"theme-jazz" },
  fire:  { title:"Fire",       file:"focus-fire.mp3",  theme:"theme-fire" }
};

let activeProfile = localStorage.getItem("sezr_active_profile") || "default";
let currentTrack = "rain";
let isAudioPlaying = false;
let totalSeconds = 25 * 60;
let focusSeconds = totalSeconds;
let remaining = totalSeconds;
let timerId = null;
let running = false;
let isBreak = false;

const todayKey = () => new Date().toISOString().slice(0,10);
const profileKey = () => "sezr_focus_profile_" + safeKey(activeProfile);

function safeKey(v){ return String(v || "default").toLowerCase().replace(/[^a-z0-9@._-]/g,"_"); }

function defaultData(){
  return { name:"", email:activeProfile === "default" ? "" : activeProfile, totalSeconds:0, totalPomodoros:0, days:{}, tasks:[], sessions:[], goal:"" };
}

function loadData(){
  try { return Object.assign(defaultData(), JSON.parse(localStorage.getItem(profileKey()) || "{}")); }
  catch { return defaultData(); }
}

let data = loadData();

function saveData(){ localStorage.setItem(profileKey(), JSON.stringify(data)); }

function ensureToday(){
  const k = todayKey();
  if(!data.days[k]) data.days[k] = {seconds:0,pomodoros:0,pauses:0,subject:""};
  return data.days[k];
}

function knownProfiles(){
  try { return JSON.parse(localStorage.getItem("sezr_profiles") || "[]"); }
  catch { return []; }
}

function saveKnownProfile(email,name){
  if(!email || email === "default") return;
  let list = knownProfiles().filter(p => p.email !== email);
  list.unshift({email,name:name || ""});
  localStorage.setItem("sezr_profiles", JSON.stringify(list.slice(0,12)));
}

function formatTimer(sec){
  const m = Math.floor(sec/60);
  const s = sec % 60;
  return String(m).padStart(2,"0") + ":" + String(s).padStart(2,"0");
}

function minText(sec){ return Math.floor(sec/60) + " dk"; }

function calculateStreak(){
  let streak = 0;
  const d = new Date();
  while(true){
    const key = d.toISOString().slice(0,10);
    const day = data.days[key];
    if(day && day.seconds >= 60){ streak++; d.setDate(d.getDate()-1); }
    else break;
  }
  return streak;
}

function focusScore(){
  const day = ensureToday();
  const min = Math.floor(day.seconds/60);
  if(min === 0 && day.pomodoros === 0) return 0;
  return Math.max(5, Math.min(100, 30 + Math.min(40,day.pomodoros*15) + Math.min(45,min) - Math.min(25,day.pauses*5)));
}

function pathsForTrack(key){
  const f = tracks[key].file;
  return ["music/"+f, f, "./music/"+f, "./"+f];
}

function loadTrack(key){
  currentTrack = key;
  const t = tracks[key];
  document.body.className = document.body.className.replace(/theme-\w+/g,"").trim();
  document.body.classList.add(t.theme);
  $("trackTitle").textContent = t.title;
  $("trackStatus").textContent = "Hazır";
  $("audio").src = pathsForTrack(key)[0];
  $("audio").load();
  $("ambientLayer").style.display = key === "rain" ? "block" : "none";
}

function tryPlay(paths,index=0){
  const audio = $("audio");
  if(index >= paths.length){
    $("trackStatus").textContent = "Ses bulunamadı. MP3 dosyaları music klasöründe mi?";
    isAudioPlaying = false;
    $("playerCard").classList.add("paused");
    $("playBtn").textContent = "▶️ Ses";
    return;
  }
  audio.src = paths[index];
  audio.load();
  audio.volume = $("volumeRange").value / 100;
  audio.play().then(() => {
    isAudioPlaying = true;
    $("playerCard").classList.remove("paused");
    $("playBtn").textContent = "⏸ Ses";
    $("trackStatus").textContent = "Çalıyor";
  }).catch(() => tryPlay(paths,index+1));
}

function playAudio(){
  if(isAudioPlaying){
    $("audio").pause();
    isAudioPlaying = false;
    $("playerCard").classList.add("paused");
    $("playBtn").textContent = "▶️ Ses";
    $("trackStatus").textContent = "Duraklatıldı";
    return;
  }
  tryPlay(pathsForTrack(currentTrack));
}

function stopAudio(){
  $("audio").pause();
  $("audio").currentTime = 0;
  isAudioPlaying = false;
  $("playerCard").classList.add("paused");
  $("playBtn").textContent = "▶️ Ses";
  $("trackStatus").textContent = "Durduruldu";
}


function pauseAudioOnly(){
  if(isAudioPlaying){
    $("audio").pause();
    isAudioPlaying = false;
    $("playerCard").classList.add("paused");
    $("playBtn").textContent = "▶️ Ses";
    $("trackStatus").textContent = "Ses duraklatıldı";
  }
}

function updateStartButtons(){
  const label = running ? "Duraklat" : (remaining < totalSeconds ? "Devam Et" : "Başlat");
  ["startBtn","startMainBtn"].forEach(id => {
    const el = $(id);
    if(!el) return;
    el.textContent = label;
    el.classList.toggle("running", running);
  });
}

function toggleFocus(){
  running ? pauseFocus() : startFocus();
}


function updateTimerUI(){
  $("timerText").textContent = formatTimer(remaining);
  const deg = ((totalSeconds - remaining) / totalSeconds) * 360;
  $("timerRing").style.setProperty("--progress", deg + "deg");
}

function startFocus(){
  if(running) return;
  if(!isAudioPlaying) playAudio();
  running = true;
  $("timerStatus").textContent = isBreak ? "Mola" : "Çalışıyor";
  updateStartButtons();
  renderSmartStatus();
  timerId = setInterval(() => {
    if(remaining > 0){
      remaining--;
      if(!isBreak){
        const day = ensureToday();
        day.seconds++;
        data.totalSeconds++;
        saveData();
      }
      renderAll();
    }else finishFocus();
  },1000);
}

function pauseFocus(){
  if(!running) return;
  clearInterval(timerId);
  running = false;
  pauseAudioOnly();
  ensureToday().pauses++;
  saveData();
  $("timerStatus").textContent = "Duraklatıldı";
  updateStartButtons();
  renderAll();
}

function resetFocus(){
  clearInterval(timerId);
  running = false;
  remaining = totalSeconds;
  $("timerStatus").textContent = "Hazır";
  updateStartButtons();
  renderAll();
}

function finishFocus(){
  clearInterval(timerId);
  running = false;
  updateStartButtons();

  if(isBreak){
    isBreak = false;
    document.body.classList.remove("break-mode");
    totalSeconds = focusSeconds;
    remaining = totalSeconds;
    $("timerStatus").textContent = "Mola bitti";
    renderAll();
    return;
  }

  const day = ensureToday();
  day.pomodoros++;
  data.totalPomodoros++;
  data.sessions.unshift(new Date().toLocaleString("tr-TR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}) + " • " + Math.round(totalSeconds/60) + " dk • " + tracks[currentTrack].title);
  data.sessions = data.sessions.slice(0,10);
  saveData();

  if($("autoNext") && $("autoNext").checked){
    startBreak(5);
  }else{
    $("successModal").classList.add("show");
    $("timerStatus").textContent = "Tamamlandı";
  }

  renderAll();
}

function setMode(min,btn){
  document.querySelectorAll(".mode").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  isBreak = false;
  document.body.classList.remove("break-mode");
  totalSeconds = min * 60;
  focusSeconds = totalSeconds;
  remaining = totalSeconds;
  resetFocus();
}

function setPlan(){
  const value = $("planInput") ? $("planInput").value.trim() : "";
  data.goal = value;
  const day = ensureToday();
  day.subject = value;
  saveData();
  renderAll();
}


function aiAdvice(){
  const day = ensureToday();
  const min = Math.floor(day.seconds/60);
  const subject = day.subject || "";
  if(subject && min === 0) return subject + " için 25 dakika sadece bu konuya odaklan. Sonra 10 soru çöz.";
  if(data.goal && min === 0) return "Hedefin hazır: " + data.goal + ". Şimdi 25 dakikalık tek bir seansla başla.";
  if(min === 0) return "Bugün için 25 dakikalık bir başlangıç yeterli.";
  if(subject && min < 60) return subject + " çalışması başladı. Bir seans daha ekleyip kısa soru pratiği yap.";
  if(min < 25) return "Başlangıç yapılmış. Ritmi kaybetmeden bir seans daha ekle.";
  if(min < 60) return "İyi gidiyorsun. Günlük 60 dakikaya yaklaşmak için bir pomodoro daha ekle.";
  if(day.pomodoros >= 2) return "Bugün güçlü çalıştın. Artık yeni konu yerine kısa tekrar ve yanlış analizi yap.";
  return "Çalışma düzenin oluşuyor. Aynı saatte tekrar etmek alışkanlığı güçlendirir.";
}

function addNote(){
  const input = $("quickNoteInput");
  const text = input ? input.value.trim() : "";
  if(!text) return;
  data.tasks.push({text,done:false});
  input.value = "";
  saveData();
  renderTasks();
}

function toggleTask(i){
  data.tasks[i].done = !data.tasks[i].done;
  saveData();
  renderTasks();
}

function deleteTask(i){
  data.tasks.splice(i,1);
  saveData();
  renderTasks();
}

function renderTasks(){
  const box = $("taskList");
  box.innerHTML = "";
  if(data.tasks.length === 0){ box.innerHTML = '<div class="session">Henüz not yok.</div>'; return; }
  data.tasks.forEach((t,i) => {
    const row = document.createElement("div");
    row.className = "task " + (t.done ? "done" : "");
    row.innerHTML = `<input type="checkbox" ${t.done ? "checked" : ""}><span>${escapeHtml(t.text)}</span><button>Sil</button>`;
    row.querySelector("input").addEventListener("change",() => { row.classList.add("flash"); toggleTask(i); });
    row.querySelector("button").addEventListener("click",() => deleteTask(i));
    box.appendChild(row);
  });
}

function renderSessions(){
  const box = $("sessionList");
  box.innerHTML = "";
  if(data.sessions.length === 0){ box.innerHTML = '<div class="session">Henüz seans yok.</div>'; return; }
  data.sessions.slice(0,5).forEach(s => {
    const div = document.createElement("div");
    div.className = "session";
    div.textContent = s;
    box.appendChild(div);
  });
}

function renderStats(){
  const day = ensureToday();
  const todayMin = Math.floor(day.seconds/60);
  $("todayMinutes").textContent = todayMin + " dk";
  $("todayPomodoros").textContent = day.pomodoros;
  $("streakDays").textContent = calculateStreak();
  $("focusScore").textContent = focusScore() + "%";
  const pct = Math.min(100, Math.round((todayMin / 60) * 100));
  $("dailyProgress").style.width = pct + "%";
  $("progressText").textContent = todayMin + " / 60 dk • %" + pct;
}

function renderProfile(){
  const label = activeProfile === "default" ? "Genel Profil" : (data.name ? data.name + " • " + activeProfile : activeProfile);
  $("activeProfile").textContent = label;
  $("settingsInfo").textContent = activeProfile === "default" ? "Genel profil kullanılıyor." : "Aktif profil: " + label;
  $("emailInput").value = activeProfile === "default" ? "" : activeProfile;
  $("nameInput").value = data.name || "";
  if($("planInput")) $("planInput").value = data.goal || "";
  renderProfileList();
}

function renderProfileList(){
  const box = $("profileList");
  const list = knownProfiles();
  box.innerHTML = "";
  if(list.length === 0){ box.innerHTML = '<div class="profile-item">Kayıtlı profil yok.</div>'; return; }
  list.forEach(p => {
    const item = document.createElement("div");
    item.className = "profile-item";
    item.innerHTML = `<span>${escapeHtml(p.name || "Öğrenci")} • ${escapeHtml(p.email)}</span><button>Geç</button>`;
    item.querySelector("button").addEventListener("click",() => switchProfile(p.email));
    box.appendChild(item);
  });
}

function switchProfile(email){
  activeProfile = email || "default";
  localStorage.setItem("sezr_active_profile", activeProfile);
  data = loadData();
  resetFocus();
  renderAll();
  $("settingsPanel").classList.remove("show");
}

function loginProfile(){
  const email = $("emailInput").value.trim().toLowerCase();
  const name = $("nameInput").value.trim();
  if(!email || !email.includes("@")){ alert("Geçerli mail gir."); return; }
  activeProfile = email;
  localStorage.setItem("sezr_active_profile", activeProfile);
  data = loadData();
  data.email = email;
  if(name) data.name = name;
  saveData();
  saveKnownProfile(email,data.name);
  resetFocus();
  renderAll();
}

function logoutProfile(){ switchProfile("default"); }

function exportData(){
  const backup = JSON.stringify(data);
  if(navigator.clipboard) navigator.clipboard.writeText(backup).then(() => alert("Yedek kodu kopyalandı."));
  else prompt("Yedek kodu:", backup);
}

function importData(){
  const raw = prompt("Yedek kodunu yapıştır:");
  if(!raw) return;
  try{
    data = Object.assign(defaultData(), JSON.parse(raw));
    saveData();
    renderAll();
    alert("Yedek yüklendi.");
  }catch{ alert("Yedek okunamadı."); }
}

function resetData(){
  if(!confirm("Bu profilin verileri sıfırlansın mı?")) return;
  data = defaultData();
  saveData();
  resetFocus();
  renderAll();
}


function lastSevenDays(){
  const arr = [];
  const now = new Date();
  for(let i=6;i>=0;i--){
    const d = new Date(now);
    d.setDate(now.getDate()-i);
    arr.push({
      key:d.toISOString().slice(0,10),
      label:d.toLocaleDateString("tr-TR",{weekday:"short",day:"2-digit"})
    });
  }
  return arr;
}

function renderWeekly(){
  const box = $("weekGrid");
  if(!box) return;
  box.innerHTML = "";
  lastSevenDays().forEach(day => {
    const d = data.days[day.key] || {seconds:0,pomodoros:0};
    const div = document.createElement("div");
    div.className = "week-day";
    div.innerHTML = `<strong>${day.label}</strong><b>${Math.floor((d.seconds||0)/60)} dk</b><span>${d.pomodoros||0} pomodoro</span>`;
    box.appendChild(div);
  });
}

function renderPlan(){
  const box = $("todayPlan");
  const display = $("planDisplay");
  if(!box) return;
  const day = ensureToday();
  const subject = data.goal || day.subject || "";
  if(display) display.textContent = subject ? subject : "Plan yazılmadı.";
  const min = Math.floor(day.seconds/60);
  let a = subject ? subject + " için 25 dk odaklan." : "Bugünkü çalışma planını yaz.";
  let b = "5 dk mola ver.";
  let c = "10 soru çöz veya kısa tekrar yap.";
  if(min >= 60){ a="Ana çalışma tamamlandı."; b="Kısa tekrar yap."; c="Yanlış analiziyle günü kapat."; }
  box.innerHTML = `<div class="plan-step"><b>1</b><span>${a}</span></div><div class="plan-step"><b>2</b><span>${b}</span></div><div class="plan-step"><b>3</b><span>${c}</span></div>`;
}


function startBreak(min){
  clearInterval(timerId);
  running = false;
  isBreak = true;
  document.body.classList.add("break-mode");
  totalSeconds = min * 60;
  remaining = totalSeconds;
  $("timerStatus").textContent = "Mola";
  renderAll();
  startFocus();
}

function renderSmartStatus(){
  const box = $("smartStatus");
  if(!box) return;
  const day = ensureToday();
  const min = Math.floor(day.seconds/60);
  if(isBreak){
    box.textContent = "Mola modundasın. Kısa dinlen, sonra çalışma seansına dön.";
  }else if(running){
    box.textContent = "Seans aktif. Sayacı durdurmadan devam etmeye çalış.";
  }else if(min === 0){
    box.textContent = "Bugün henüz çalışma başlamadı. 25 dakikalık bir seans iyi başlangıç olur.";
  }else if(min < 60){
    box.textContent = "Bugün " + min + " dakika çalıştın. 60 dakikaya ulaşmak için bir seans daha ekleyebilirsin.";
  }else{
    box.textContent = "Günlük hedef tamamlandı. Bundan sonrası tekrar veya yanlış analizi için ideal.";
  }
}

function renderAll(){
  updateTimerUI();
  updateStartButtons();
  $("aiAdvice").textContent = aiAdvice();
  renderStats();
  renderSmartStatus();
  renderWeekly();
  renderPlan();
  renderTasks();
  renderSessions();
  renderProfile();
}

function escapeHtml(text){
  return String(text).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}

function buildAmbience(){
  const rain = $("ambientLayer");
  rain.innerHTML = "";
  for(let i=0;i<90;i++){
    const d = document.createElement("div");
    d.className = "drop";
    d.style.left = Math.random()*100 + "%";
    d.style.animationDuration = (0.6 + Math.random()*0.7) + "s";
    d.style.animationDelay = Math.random()*2 + "s";
    rain.appendChild(d);
  }
  const symbols = $("mathSymbols");
  const syms = ["∫","π","√","Σ","Δ","f(x)","lim","x²","∞"];
  for(let i=0;i<28;i++){
    const s = document.createElement("span");
    s.className = "symbol";
    s.textContent = syms[i % syms.length];
    s.style.left = Math.random()*100 + "%";
    s.style.top = Math.random()*100 + "%";
    s.style.fontSize = (24 + Math.random()*58) + "px";
    s.style.animationDuration = (10 + Math.random()*15) + "s";
    symbols.appendChild(s);
  }
}

function bind(){
  on("startMainBtn","click",toggleFocus);
  on("startBtn","click",toggleFocus);
  on("resetBtn","click",resetFocus);
  $("rainBtn").addEventListener("click",() => {
    $("ambientLayer").style.display = $("ambientLayer").style.display === "none" ? "block" : "none";
  });
  on("playBtn","click",playAudio);
  on("volumeRange","input",e => {
    if($("audio")) $("audio").volume = e.target.value/100;
    if($("volumeText")) $("volumeText").textContent = e.target.value + "%";
  });
  document.querySelectorAll(".mode").forEach(btn => btn.addEventListener("click",() => setMode(Number(btn.dataset.min),btn)));
  document.querySelectorAll(".break-btn").forEach(btn => btn.addEventListener("click",() => startBreak(Number(btn.dataset.break))));
  document.querySelectorAll(".music-card").forEach(card => card.addEventListener("click",() => {
    document.querySelectorAll(".music-card").forEach(c => c.classList.remove("active"));
    card.classList.add("active");
    const wasPlaying = isAudioPlaying;
    stopAudio();
    loadTrack(card.dataset.track);
    if(wasPlaying) playAudio();
  }));
  on("savePlanBtn","click",setPlan);
  
  on("addNoteBtn","click",addNote);
  on("settingsBtn","click",() => $("settingsPanel").classList.toggle("show"));
  on("loginBtn","click",loginProfile);
  on("logoutBtn","click",logoutProfile);
  on("exportBtn","click",exportData);
  on("importBtn","click",importData);
  on("resetDataBtn","click",resetData);
  on("cleanBtn","click",() => document.body.classList.toggle("clean"));
  on("closeSuccessBtn","click",() => { $("successModal").classList.remove("show"); resetFocus(); });
  document.addEventListener("keydown",e => {
    const tag = (e.target && e.target.tagName ? e.target.tagName.toLowerCase() : "");
    const typing = tag === "input" || tag === "textarea" || (e.target && e.target.isContentEditable);
    if(typing) return;
    if(e.code === "Space"){
      e.preventDefault();
      toggleFocus();
    }
  });
}

buildAmbience();
bind();
loadTrack("rain");
$("audio").volume = 0.6;
renderAll();
});