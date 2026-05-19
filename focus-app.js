document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const cfg = window.SEZR_FOCUS_CONFIG || {};
  let auth = null;
  let db = null;
  let user = null;
  let guestMode = true; // default: never lock the app

  try{
    if(cfg.firebaseEnabled && window.firebase && cfg.firebase && cfg.firebase.apiKey){
      if(!firebase.apps.length) firebase.initializeApp(cfg.firebase);
      auth = firebase.auth();
      db = firebase.firestore();
    }
  }catch(e){
    console.warn("Firebase disabled:", e);
  }

  const tracks = {
    rain:{title:"Rain Focus",file:"focus-rain.mp3",theme:"theme-rain"},
    lofi:{title:"Lo-fi",file:"focus-lofi.mp3",theme:"theme-lofi"},
    piano:{title:"Piano",file:"focus-piano.mp3",theme:"theme-piano"},
    relax:{title:"Relax",file:"focus-relax.mp3",theme:"theme-relax"},
    jazz:{title:"Jazz",file:"focus-jazz.mp3",theme:"theme-jazz"},
    fire:{title:"Fire",file:"focus-fire.mp3",theme:"theme-fire"}
  };

  const examOptions = {
    YKS: [
      {value:"TYT", label:"TYT", date:"2026-06-20"},
      {value:"AYT", label:"AYT", date:"2026-06-21"},
      {value:"YDT", label:"YDT / Dil", date:"2026-06-21"}
    ],
    LGS: [{value:"LGS", label:"LGS", date:"2026-06-14"}],
    KPSS: [{value:"KPSS", label:"KPSS", date:"2026-09-06"}],
    DGS: [{value:"DGS", label:"DGS", date:"2026-07-19"}]
  };

  const quotes = [
    "Sadece bu seans.",
    "Küçük adım, büyük fark.",
    "Dikkatini koru.",
    "Bir soru daha.",
    "Şimdi odak zamanı."
  ];

  let data = blank();
  let currentTrack = "rain";
  let running = false;
  let timerId = null;
  let focusSeconds = 25 * 60;
  let totalSeconds = focusSeconds;
  let remaining = totalSeconds;

  let isBreak = false;
  let pausedFocusRemaining = null;
  let pausedFocusTotal = null;
  let breakTimerId = null;
  let breakRemaining = 5 * 60;
  let breakRunning = false;

  let isAudioPlaying = false;
  let mode = "login";
  let saveTimer = null;
  let overlayTimer = null;
  let quoteTimer = null;
  let latestExamSuggestion = "20 soru çöz ve yanlışlarını işaretle.";

  function blank(){
    return {
      email:"",
      tasks:[],
      dailyTarget:60,
      exam:{group:"YKS",type:"TYT",date:"2026-06-20",hidden:false},
      notes:[],
      totalSeconds:0,
      totalPomodoros:0,
      days:{}
    };
  }

  function key(){
    return user ? "sezr_focus_cloud_" + user.uid : "sezr_focus_guest";
  }

  function today(){
    return new Date().toISOString().slice(0,10);
  }

  function day(){
    const k = today();
    if(!data.days[k]) data.days[k] = {seconds:0,pomodoros:0,pauses:0};
    return data.days[k];
  }

  function loadLocal(){
    try{
      return Object.assign(blank(), JSON.parse(localStorage.getItem(key()) || "{}"));
    }catch{
      return blank();
    }
  }

  function saveLocal(){
    localStorage.setItem(key(), JSON.stringify(data));
  }

  function queueSave(){
    saveLocal();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveCloud, 900);
  }

  async function saveCloud(){
    saveLocal();

    if(guestMode || !user || !db){
      setCloudStatus("Misafir mod: kayıtlar sadece bu cihazda saklanır.","warn");
      return;
    }

    try{
      data.email = user.email || data.email || "";
      data.updatedAt = new Date().toISOString();
      await db.collection("focusUsers").doc(user.uid).set(data,{merge:true});
      setCloudStatus("Bulut aktif: kayıtlar bu hesaba kaydediliyor.","ok");
    }catch(e){
      console.warn("Cloud save failed:", e);
      setCloudStatus("Buluta yazılamadı. Firestore izinlerini kontrol et.","warn");
    }
  }

  async function loadCloud(){
    data = loadLocal();

    if(!guestMode && user && db){
      try{
        const ref = db.collection("focusUsers").doc(user.uid);
        const snap = await ref.get();

        if(snap.exists){
          data = Object.assign(blank(), snap.data());
          saveLocal();
          setCloudStatus("Bulut aktif: kayıtlar bu hesaptan yüklendi.","ok");
        }else{
          data.email = user.email || "";
          data.updatedAt = new Date().toISOString();
          await ref.set(data,{merge:true});
          saveLocal();
          setCloudStatus("Bulut aktif: bu hesap için yeni kayıt oluşturuldu.","ok");
        }
      }catch(e){
        console.warn("Cloud load failed:", e);
        data.email = user.email || data.email || "";
        setCloudStatus("Bulut okunamadı. Firestore kuralları izin vermiyor olabilir.","warn");
      }
    }else{
      setCloudStatus("Misafir mod: kayıtlar sadece bu cihazda saklanır.","warn");
    }

    render();
  }

  function fmt(sec){
    const m = Math.floor(sec/60);
    const s = sec % 60;
    return String(m).padStart(2,"0") + ":" + String(s).padStart(2,"0");
  }

  function showMessage(msg,type=""){
    const el = $("authMessage");
    if(!el) return;
    el.textContent = msg || "";
    el.className = "auth-message" + (type ? " " + type : "");
  }

  function setCloudStatus(text,type=""){
    const el = $("cloudSyncStatus");
    if(!el) return;
    el.textContent = text;
    el.className = "cloud-sync-status" + (type ? " " + type : "");
  }

  function showApp(){
    if($("authScreen")) $("authScreen").classList.add("hidden");
    if($("appPage")) $("appPage").classList.remove("hidden");
    if($("settingsBtn")) $("settingsBtn").classList.remove("hidden");
  }

  function showAuth(){
    if($("authScreen")) $("authScreen").classList.remove("hidden");
    if($("appPage")) $("appPage").classList.add("hidden");
    if($("settingsBtn")) $("settingsBtn").classList.add("hidden");
    if($("settingsPanel")) $("settingsPanel").classList.remove("show");
  }

  function continueGuest(){
    guestMode = true;
    user = null;
    localStorage.setItem("sezr_guest_mode","1");
    data = loadLocal();
    showApp();
    setCloudStatus("Misafir mod: kayıtlar sadece bu cihazda saklanır.","warn");
    render();
  }

  async function signIn(){
    const email = $("authEmail") ? $("authEmail").value.trim().toLowerCase() : "";
    const pass = $("authPassword") ? $("authPassword").value : "";
    if(!email || !pass){ showMessage("Mail ve şifre gir.","error"); return; }
    if(!auth){ showMessage("Firebase hazır değil. Misafir devam et.","error"); return; }

    try{
      if($("authSubmit")) $("authSubmit").disabled = true;
      showMessage("Giriş yapılıyor...");
      const result = await Promise.race([
        auth.signInWithEmailAndPassword(email, pass),
        new Promise((_, reject) => setTimeout(()=>reject(new Error("timeout")), 8000))
      ]);
      user = result.user;
      guestMode = false;
      localStorage.removeItem("sezr_guest_mode");
      showApp();
      await loadCloud();
      showMessage("Giriş başarılı.","success");
    }catch(e){
      showMessage(e.message === "timeout" ? "Giriş uzun sürdü. Misafir devam et." : authError(e),"error");
    }finally{
      if($("authSubmit")) $("authSubmit").disabled = false;
    }
  }

  async function register(){
    const email = $("authEmail") ? $("authEmail").value.trim().toLowerCase() : "";
    const pass = $("authPassword") ? $("authPassword").value : "";
    if(!email || !pass || pass.length < 6){ showMessage("Mail gir ve en az 6 karakter şifre yaz.","error"); return; }
    if(!auth){ showMessage("Firebase hazır değil. Misafir devam et.","error"); return; }

    try{
      if($("authSubmit")) $("authSubmit").disabled = true;
      showMessage("Hesap oluşturuluyor...");
      const result = await Promise.race([
        auth.createUserWithEmailAndPassword(email, pass),
        new Promise((_, reject) => setTimeout(()=>reject(new Error("timeout")), 8000))
      ]);
      user = result.user;
      guestMode = false;
      localStorage.removeItem("sezr_guest_mode");
      data = blank();
      data.email = email;
      showApp();
      await saveCloud();
      render();
      showMessage("Hesap oluşturuldu.","success");
    }catch(e){
      showMessage(e.message === "timeout" ? "İşlem uzun sürdü. Misafir devam et." : authError(e),"error");
    }finally{
      if($("authSubmit")) $("authSubmit").disabled = false;
    }
  }

  async function forgot(){
    const email = $("authEmail") ? $("authEmail").value.trim().toLowerCase() : "";
    if(!email){ showMessage("Mail adresini yaz.","error"); return; }
    if(!auth){ showMessage("Firebase hazır değil.","error"); return; }
    try{
      await auth.sendPasswordResetEmail(email);
      showMessage("Şifre sıfırlama maili gönderildi.","success");
    }catch(e){
      showMessage(authError(e),"error");
    }
  }

  function authError(e){
    const code = e && e.code ? e.code : "";
    if(code.includes("user-not-found")) return "Bu mail ile hesap bulunamadı.";
    if(code.includes("wrong-password") || code.includes("invalid-credential")) return "Mail veya şifre hatalı.";
    if(code.includes("email-already-in-use")) return "Bu mail ile hesap var.";
    if(code.includes("weak-password")) return "Şifre en az 6 karakter olmalı.";
    if(code.includes("operation-not-allowed")) return "Email/Password girişini Firebase’de açmalısın.";
    return "Giriş yapılamadı. Misafir devam edebilirsin.";
  }

  function setAuthMode(next){
    mode = next;
    if($("loginTab")) $("loginTab").classList.toggle("active", mode === "login");
    if($("registerTab")) $("registerTab").classList.toggle("active", mode === "register");
    if($("authSubmit")) $("authSubmit").textContent = mode === "login" ? "Giriş Yap" : "Hesap Oluştur";
    showMessage("");
  }

  function getTasks(){
    data.tasks = Array.isArray(data.tasks) ? data.tasks : [];
    return data.tasks;
  }

  function taskStats(){
    const tasks = getTasks();
    const total = tasks.length;
    const done = tasks.filter(t=>t.done).length;
    return {total,done,pct: total ? Math.round(done/total*100) : 0};
  }

  function mainTaskText(){
    const tasks = getTasks();
    if(tasks.length === 0) return "Görev eklenmedi";
    return tasks.map(t => (t.done ? "✓ " : "• ") + t.text).join(" / ");
  }

  async function addDailyTask(){
    const input = $("taskInput");
    if(!input) return;
    const text = input.value.trim();
    if(!text) return;
    getTasks().push({text,done:false,createdAt:new Date().toISOString()});
    input.value = "";
    queueSave();
    render();
  }

  async function toggleDailyTask(index){
    const tasks = getTasks();
    if(!tasks[index]) return;
    tasks[index].done = !tasks[index].done;
    queueSave();
    render();
  }

  async function deleteDailyTask(index){
    const tasks = getTasks();
    if(!tasks[index]) return;
    tasks.splice(index,1);
    queueSave();
    render();
  }

  async function clearDoneTasks(){
    const tasks = getTasks();
    if(!tasks.some(t=>t.done)) return;
    data.tasks = tasks.filter(t=>!t.done);
    queueSave();
    render();
  }

  async function clearDailyTasks(){
    if(getTasks().length === 0) return;
    if(!confirm("Bugünkü tüm görevler temizlensin mi?")) return;
    data.tasks = [];
    queueSave();
    render();
  }

  async function addExamTask(){
    getTasks().push({text:latestExamSuggestion || "20 soru çöz ve yanlışlarını işaretle.",done:false,createdAt:new Date().toISOString()});
    queueSave();
    render();
  }

  async function addNote(){
    const input = $("noteInput");
    if(!input) return;
    const text = input.value.trim();
    if(!text) return;
    data.notes = Array.isArray(data.notes) ? data.notes : [];
    data.notes.push({text,date:new Date().toLocaleDateString("tr-TR"),time:new Date().toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"})});
    input.value = "";
    queueSave();
    render();
  }

  function renderDailyTasks(){
    const box = $("taskListMain");
    if(!box) return;
    const tasks = getTasks();
    box.innerHTML = "";
    if(tasks.length === 0){
      box.innerHTML = '<div class="daily-task"><div class="daily-task-main"><span class="check">+</span><span>Henüz görev eklenmedi.</span></div></div>';
    }else{
      tasks.forEach((task,index)=>{
        const item = document.createElement("div");
        item.className = "daily-task " + (task.done ? "done" : "");
        item.innerHTML = '<div class="daily-task-main"><span class="check">'+(task.done ? "✓" : "")+'</span><span></span></div><button class="daily-task-delete">Sil</button>';
        item.querySelector(".daily-task-main span:last-child").textContent = task.text;
        item.querySelector(".daily-task-main").onclick = () => toggleDailyTask(index);
        item.querySelector(".daily-task-delete").onclick = e => { e.stopPropagation(); deleteDailyTask(index); };
        box.appendChild(item);
      });
    }
    const ts = taskStats();
    if($("planProgressFill")) $("planProgressFill").style.width = ts.pct + "%";
    if($("planProgressText")) $("planProgressText").textContent = "Görev ilerlemesi: %" + ts.pct + " (" + ts.done + "/" + ts.total + ")";
  }

  function renderNotes(){
    const box = $("noteList");
    if(!box) return;
    data.notes = (Array.isArray(data.notes) ? data.notes : []).filter(n => (typeof n === "string" ? n.trim() : (n.text || "").trim()));
    box.innerHTML = "";
    if(data.notes.length === 0){
      box.innerHTML = '<div class="list-item">Henüz not yok.</div>';
      return;
    }
    data.notes.forEach((n,i)=>{
      const text = typeof n === "string" ? n : n.text;
      const date = typeof n === "string" ? "" : (n.date + " • " + n.time);
      const div = document.createElement("div");
      div.className = "list-item";
      div.innerHTML = '<span><span class="note-text"></span><span class="note-date"></span></span><button>Sil</button>';
      div.querySelector(".note-text").textContent = text;
      div.querySelector(".note-date").textContent = date;
      div.querySelector("button").onclick = () => { data.notes.splice(i,1); queueSave(); render(); };
      box.appendChild(div);
    });
  }

  function buildTodaySummary(){
    const d = day();
    const min = Math.floor((d.seconds||0)/60);
    const ts = taskStats();
    const exam = data.exam && data.exam.type ? " • Sınav: " + data.exam.type : "";
    return "Görevler: " + mainTaskText() + exam + " • Tamamlama: %" + ts.pct + " • Süre: " + min + " dk • Pomodoro: " + (d.pomodoros || 0);
  }

  function advice(){
    const min = Math.floor(day().seconds/60);
    const ts = taskStats();
    if(ts.total === 0 && min === 0) return "Bir görev ekleyip odak seansına başla.";
    if(ts.total > 0 && ts.done === ts.total) return "Bugünkü görevler tamamlandı.";
    if(ts.total > 0 && min === 0) return "Görevlerin hazır. İlk göreve odaklan.";
    if(min < Number(data.dailyTarget || 60)) return "Bir seans daha ekleyebilirsin.";
    return "Günlük hedef tamamlandı.";
  }

  function nextSuggestion(){
    const min = Math.floor(day().seconds/60);
    const ts = taskStats();
    if(ts.total === 0) return "Sonraki adım: görev ekle.";
    if(ts.total > 0 && ts.done === ts.total) return "Sonraki adım: kısa tekrar.";
    if(min === 0) return "Sonraki adım: ilk göreve odaklan.";
    return "Sonraki adım: ritmi koru.";
  }

  function score(){
    const d = day();
    const min = Math.floor(d.seconds/60);
    if(min === 0 && d.pomodoros === 0) return 0;
    return Math.max(5, Math.min(100, 30 + Math.min(45,min) + Math.min(40,d.pomodoros*15) - Math.min(25,(d.pauses||0)*5)));
  }

  function streak(){
    let count = 0;
    const d = new Date();
    while(true){
      const k = d.toISOString().slice(0,10);
      if(data.days[k] && data.days[k].seconds >= 60){ count++; d.setDate(d.getDate()-1); }
      else break;
    }
    return count;
  }

  function last7Days(){
    const arr = [];
    const now = new Date();
    for(let i=6;i>=0;i--){
      const d = new Date(now);
      d.setDate(now.getDate()-i);
      arr.push({key:d.toISOString().slice(0,10), label:d.toLocaleDateString("tr-TR",{weekday:"short"})});
    }
    return arr;
  }

  function renderWeekly(){
    const box = $("weekBars");
    const totalEl = $("weeklyTotal");
    if(!box) return;
    const days = last7Days();
    let total = 0;
    const maxMin = Math.max(60, ...days.map(x=>Math.floor(((data.days[x.key]||{}).seconds||0)/60)));
    box.innerHTML = "";
    days.forEach(x=>{
      const min = Math.floor(((data.days[x.key]||{}).seconds||0)/60);
      total += min;
      const h = Math.max(20, Math.round((min/maxMin)*130));
      const item = document.createElement("div");
      item.className = "week-day" + (x.key === today() ? " active-today" : "");
      item.innerHTML = '<div class="week-bar" style="height:'+h+'px"></div><b>'+min+' dk</b><span>'+x.label+'</span>';
      box.appendChild(item);
    });
    if(totalEl) totalEl.textContent = total + " dk";
    if($("weeklyInsight")){
      const activeDays = days.filter(x=>((data.days[x.key]||{}).seconds||0)>0).length;
      $("weeklyInsight").textContent = total ? ("Bu hafta " + activeDays + " gün çalıştın. Toplam: " + total + " dk.") : "Haftalık veri için çalışmaya başla.";
    }
  }

  function renderRhythm(){
    const avgEl = $("weeklyAverage");
    const bestEl = $("bestDay");
    const textEl = $("rhythmText");
    if(!avgEl || !bestEl || !textEl) return;
    const days = last7Days();
    const mins = days.map(x=>Math.floor(((data.days[x.key]||{}).seconds||0)/60));
    const total = mins.reduce((a,b)=>a+b,0);
    const avg = Math.round(total/7);
    const best = Math.max(0,...mins);
    avgEl.textContent = avg + " dk";
    bestEl.textContent = best + " dk";
    const card = document.querySelector(".rhythm-card");
    if(card) card.classList.toggle("not-ready", total === 0);
    textEl.textContent = total ? "Çalışma ritmi aktif." : "Çalışma ritmi için biraz veri gerekli.";
  }

  function ensureExam(){
    data.exam = data.exam || {group:"YKS",type:"TYT",date:"2026-06-20",hidden:false};
    if(!data.exam.group) data.exam.group = "YKS";
    if(!data.exam.type) data.exam.type = "TYT";
    if(!data.exam.date) data.exam.date = "2026-06-20";
  }

  function renderExamTypeOptions(){
    ensureExam();
    const sel = $("examTypeSelect");
    if(!sel) return;
    const opts = examOptions[data.exam.group] || examOptions.YKS;
    sel.innerHTML = "";
    opts.forEach(opt=>{
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      sel.appendChild(o);
    });
    if(!opts.some(x=>x.value === data.exam.type)){
      data.exam.type = opts[0].value;
      data.exam.date = opts[0].date;
    }
    sel.value = data.exam.type;
  }

  function renderExamCountdown(){
    ensureExam();
    const panel = $("examCountdownPanel");
    if(!panel) return;
    renderExamTypeOptions();
    if($("examGroupSelect")) $("examGroupSelect").value = data.exam.group;
    if($("examDateInput")) $("examDateInput").value = data.exam.date;
    panel.classList.toggle("collapsed", !!data.exam.hidden);
    if($("toggleExamBtn")) $("toggleExamBtn").textContent = data.exam.hidden ? "Göster" : "Gizle";

    const label = (examOptions[data.exam.group] || []).find(x=>x.value===data.exam.type)?.label || data.exam.type;
    if($("examSubtitle")) $("examSubtitle").textContent = label + " için kalan süre";

    const diff = new Date(data.exam.date + "T10:00:00").getTime() - Date.now();
    if(diff <= 0){
      ["examDays","examHours","examMinutes","examSeconds"].forEach(id=>{ if($(id)) $(id).textContent = "0"; });
      if($("examAdvice")) $("examAdvice").textContent = "Yeni sınav tarihi seçebilirsin.";
      return;
    }
    const s = Math.floor(diff/1000);
    const days = Math.floor(s/(60*60*24));
    const hours = Math.floor((s%(60*60*24))/(60*60));
    const minutes = Math.floor((s%(60*60))/60);
    const seconds = s%60;
    if($("examDays")) $("examDays").textContent = days;
    if($("examHours")) $("examHours").textContent = hours;
    if($("examMinutes")) $("examMinutes").textContent = minutes;
    if($("examSeconds")) $("examSeconds").textContent = seconds;

    let a = "Bugün küçük ama net bir çalışma planı seç.";
    if(days > 120) a = "Konu eksiklerini kapat.";
    else if(days > 60) a = "Deneme ve konu tekrarını dengele.";
    else if(days > 30) a = "Yanlış analizi ve süre yönetimine odaklan.";
    else if(days > 7) a = "Tekrar ve deneme analizini artır.";
    else a = "Son hafta: hafif tekrar ve düzen.";
    if($("examAdvice")) $("examAdvice").textContent = a;

    latestExamSuggestion = days <= 7 ? "Hafif tekrar + yanlış analizi" : "Soru pratiği + yanlış analizi";
    if($("studyIntensity")){
      const todayMin = Math.floor((day().seconds||0)/60);
      const suggested = days > 120 ? 45 : days > 60 ? 60 : days > 30 ? 75 : days > 7 ? 90 : 60;
      $("studyIntensity").classList.toggle("good", todayMin >= suggested);
      $("studyIntensity").classList.toggle("warn", todayMin > 0 && todayMin < suggested);
      $("studyIntensity").textContent = todayMin >= suggested ? "Bugün önerilen seviyeyi yakaladın." : ("Önerilen günlük çalışma: " + suggested + " dk.");
    }
  }

  async function changeExamGroup(){
    ensureExam();
    data.exam.group = $("examGroupSelect").value;
    const first = examOptions[data.exam.group][0];
    data.exam.type = first.value;
    data.exam.date = first.date;
    queueSave();
    render();
  }

  async function changeExamType(){
    ensureExam();
    data.exam.type = $("examTypeSelect").value;
    const found = (examOptions[data.exam.group] || []).find(x=>x.value===data.exam.type);
    if(found) data.exam.date = found.date;
    queueSave();
    render();
  }

  async function saveExamSettings(){
    ensureExam();
    data.exam.group = $("examGroupSelect").value;
    data.exam.type = $("examTypeSelect").value;
    data.exam.date = $("examDateInput").value || data.exam.date;
    queueSave();
    render();
  }

  async function toggleExamPanel(){
    ensureExam();
    data.exam.hidden = !data.exam.hidden;
    queueSave();
    render();
  }

  async function changeDailyTarget(value){
    data.dailyTarget = Number(value || 60);
    queueSave();
    render();
  }

  function setTrack(track){
    currentTrack = track;
    const t = tracks[track];
    document.body.className = document.body.className.replace(/theme-\w+/g,"").trim();
    document.body.classList.add(t.theme);
    if($("trackTitle")) $("trackTitle").textContent = t.title;
    if($("trackStatus")) $("trackStatus").textContent = "Müzik sayaçla birlikte başlar ve durur.";
    if($("rainLayer")) $("rainLayer").style.display = track === "rain" ? "block" : "none";
    document.querySelectorAll(".track").forEach(b=>b.classList.toggle("active", b.dataset.track===track));
  }

  function playAudioPath(list,i=0){
    if(i >= list.length){ if($("trackStatus")) $("trackStatus").textContent = "Ses dosyası bulunamadı."; return; }
    const a = $("focusAudio");
    if(!a) return;
    a.src = list[i];
    a.volume = ($("volumeRange") ? $("volumeRange").value : 60) / 100;
    a.play().then(()=>{
      isAudioPlaying = true;
      const p = document.querySelector(".music-panel");
      if(p) p.classList.remove("paused");
      if($("trackStatus")) $("trackStatus").textContent = "Çalıyor";
    }).catch(()=>playAudioPath(list,i+1));
  }

  function audioPaths(){
    const f = tracks[currentTrack].file;
    return ["music/"+f,f,"./music/"+f,"./"+f];
  }

  function playAudio(){
    if(isBreak || isAudioPlaying) return;
    playAudioPath(audioPaths());
  }

  function pauseAudio(){
    const a = $("focusAudio");
    if(a) a.pause();
    isAudioPlaying = false;
    const p = document.querySelector(".music-panel");
    if(p) p.classList.add("paused");
    if($("trackStatus")) $("trackStatus").textContent = "Duraklatıldı";
  }

  function forceStopAudio(){
    const a = $("focusAudio");
    if(a){ a.pause(); a.currentTime = 0; }
    isAudioPlaying = false;
    const p = document.querySelector(".music-panel");
    if(p) p.classList.add("paused");
    if($("trackStatus")) $("trackStatus").textContent = "Mola sırasında ses kapalı";
  }

  function start(){
    if(running) return;
    running = true;
    if($("timerStatus")) $("timerStatus").textContent = "Çalışıyor";
    playAudio();
    clearInterval(timerId);
    timerId = setInterval(()=>{
      if(remaining > 0){
        remaining--;
        day().seconds++;
        data.totalSeconds++;
        queueSave();
        render();
      }else{
        finishFocus();
      }
    },1000);
    render();
  }

  function pause(){
    if(!running) return;
    clearInterval(timerId);
    running = false;
    day().pauses = (day().pauses || 0) + 1;
    pauseAudio();
    if($("timerStatus")) $("timerStatus").textContent = "Duraklatıldı";
    queueSave();
    render();
  }

  function toggle(){
    running ? pause() : start();
  }

  function reset(){
    clearInterval(timerId);
    clearInterval(breakTimerId);
    running = false;
    isBreak = false;
    breakRunning = false;
    pausedFocusRemaining = null;
    pausedFocusTotal = null;
    totalSeconds = focusSeconds;
    remaining = totalSeconds;
    pauseAudio();
    closeBreakModal();
    if($("timerStatus")) $("timerStatus").textContent = "Hazır";
    render();
  }

  function finishFocus(){
    clearInterval(timerId);
    running = false;
    day().pomodoros = (day().pomodoros || 0) + 1;
    data.totalPomodoros = (data.totalPomodoros || 0) + 1;
    queueSave();
    pauseAudio();
    if($("successModal")) $("successModal").classList.add("show");
    if($("timerStatus")) $("timerStatus").textContent = "Tamamlandı";
    render();
  }

  function startBreak(min){
    if(isBreak){ openBreakModal(); return; }
    clearInterval(timerId);
    running = false;
    pausedFocusRemaining = remaining;
    pausedFocusTotal = totalSeconds;
    isBreak = true;
    breakRemaining = min * 60;
    breakRunning = false;
    forceStopAudio();
    openBreakModal();
    render();
  }

  function openBreakModal(){
    const m = $("breakModal");
    if(m){
      m.classList.add("show");
      requestFullscreenSafe(m);
    }
    updateBreakModal();
  }

  function closeBreakModal(){
    const m = $("breakModal");
    if(m) m.classList.remove("show");
    if(document.fullscreenElement === m) document.exitFullscreen().catch(()=>{});
  }

  function updateBreakModal(){
    if($("breakModalTimer")) $("breakModalTimer").textContent = fmt(breakRemaining);
    if($("breakStartPauseBtn")){
      $("breakStartPauseBtn").textContent = breakRunning ? "Duraklat" : "Başlat";
      $("breakStartPauseBtn").classList.toggle("running", breakRunning);
    }
  }

  function toggleBreakTimer(){
    if(!isBreak) return;
    if(breakRunning){
      clearInterval(breakTimerId);
      breakRunning = false;
      updateBreakModal();
      return;
    }
    clearInterval(breakTimerId);
    breakRunning = true;
    updateBreakModal();
    breakTimerId = setInterval(()=>{
      if(breakRemaining > 0){
        breakRemaining--;
        updateBreakModal();
      }else{
        finishBreak(false);
      }
    },1000);
  }

  function finishBreak(manual=true){
    clearInterval(breakTimerId);
    breakRunning = false;
    isBreak = false;
    totalSeconds = pausedFocusTotal || focusSeconds;
    remaining = pausedFocusRemaining !== null ? pausedFocusRemaining : totalSeconds;
    pausedFocusRemaining = null;
    pausedFocusTotal = null;
    closeBreakModal();
    forceStopAudio();
    if($("timerStatus")) $("timerStatus").textContent = manual ? "Moladan döndün" : "Mola bitti";
    render();
  }

  function requestFullscreenSafe(el){
    try{
      if(el && el.requestFullscreen) el.requestFullscreen().catch(()=>{});
      else if(el && el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    }catch{}
  }

  function exitFullscreenSafe(){
    try{
      if(document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(()=>{});
      else if(document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
    }catch{}
  }

  function enterFullscreenFocus(){
    const o = $("focusOverlay");
    if(!o) return;
    o.classList.add("show","controls-visible");
    document.body.classList.add("overlay-open");
    requestFullscreenSafe(o);
    showOverlayControls();
    showQuote();
  }

  function exitFullscreenFocus(){
    const o = $("focusOverlay");
    if(!o) return;
    o.classList.remove("show","controls-visible");
    document.body.classList.remove("overlay-open");
    clearTimeout(overlayTimer);
    exitFullscreenSafe();
  }

  function showOverlayControls(){
    const o = $("focusOverlay");
    if(!o) return;
    o.classList.add("controls-visible");
    clearTimeout(overlayTimer);
    overlayTimer = setTimeout(()=>o.classList.remove("controls-visible"),2600);
  }

  function showQuote(){
    const q = $("overlayQuote");
    if(!q) return;
    q.textContent = quotes[Math.floor(Math.random()*quotes.length)];
    q.classList.add("show");
    setTimeout(()=>q.classList.remove("show"),4000);
  }

  function applyCompactMode(){
    document.body.classList.toggle("compact-ui", localStorage.getItem("sezr_compact_ui") === "1");
    if($("compactModeBtn")){
      $("compactModeBtn").textContent = document.body.classList.contains("compact-ui") ? "Standart Görünüm" : "Sade Görünüm";
    }
  }

  function toggleCompactMode(){
    localStorage.setItem("sezr_compact_ui", localStorage.getItem("sezr_compact_ui") === "1" ? "0" : "1");
    applyCompactMode();
  }

  function render(){
    const d = day();
    const min = Math.floor((d.seconds || 0)/60);
    const target = Number(data.dailyTarget || 60);
    const pct = Math.min(100, Math.round(min/target*100));
    const ts = taskStats();

    if($("timerText")) $("timerText").textContent = fmt(remaining);
    if($("overlayTimer")) $("overlayTimer").textContent = fmt(remaining);
    if($("timerRing")) $("timerRing").style.setProperty("--progress", ((totalSeconds-remaining)/totalSeconds*360)+"deg");
    if($("mainToggleBtn")){
      $("mainToggleBtn").textContent = running ? "Duraklat" : (remaining < totalSeconds ? "Devam Et" : "Başlat");
      $("mainToggleBtn").classList.toggle("running", running);
    }
    if($("overlayToggleBtn")){
      $("overlayToggleBtn").textContent = running ? "Duraklat" : (remaining < totalSeconds ? "Devam Et" : "Başlat");
      $("overlayToggleBtn").classList.toggle("running", running);
    }
    if($("overlayStatus")) $("overlayStatus").textContent = running ? "Çalışıyor" : "Hazır";
    if($("overlaySubStatus")) $("overlaySubStatus").textContent = running ? "Odak modundasın." : "Kaldığın yerden devam edebilirsin.";

    renderDailyTasks();
    renderNotes();

    if($("aiAdvice")) $("aiAdvice").textContent = advice();
    if($("nextSuggestion")) $("nextSuggestion").textContent = nextSuggestion();
    if($("todayMinutes")) $("todayMinutes").textContent = min + " dk";
    if($("todayPomodoros")) $("todayPomodoros").textContent = d.pomodoros || 0;
    if($("focusScore")) $("focusScore").textContent = score() + "%";
    if($("streakDays")) $("streakDays").textContent = streak();
    if($("taskCompletion")) $("taskCompletion").textContent = ts.pct + "%";
    if($("progressFill")) $("progressFill").style.width = pct + "%";
    if($("progressText")) $("progressText").textContent = min + " / " + target + " dk • %" + pct;
    if($("focusLevel")){
      $("focusLevel").textContent = min >= target ? "Günlük hedef tamamlandı" : min >= target*0.66 ? "Güçlü odak" : min >= target*0.33 ? "İyi ilerleme" : "Başlangıç";
    }
    if($("targetAdvice")){
      $("targetAdvice").textContent = min >= target ? "Günlük hedef tamamlandı." : min > 0 ? ("Hedefe kalan süre: " + Math.max(0,target-min) + " dk.") : "İlk seansı başlat.";
    }
    document.querySelectorAll("#dailyTargetOptions button").forEach(btn=>{
      btn.classList.toggle("active", Number(btn.dataset.target) === target);
    });
    if($("accountEmail")) $("accountEmail").textContent = guestMode ? "Misafir mod" : (user ? user.email : "");
    if(user && !guestMode && $("cloudSyncStatus") && !$("cloudSyncStatus").classList.contains("warn")){
      setCloudStatus("Bulut aktif: kayıtlar bu hesaba bağlı.","ok");
    }
    if($("profileChip")) $("profileChip").textContent = guestMode ? "Misafir Mod" : (user ? user.email : "Hesap");

    renderWeekly();
    renderRhythm();
    renderExamCountdown();
    applyCompactMode();
  }

  function makeRain(){
    const r = $("rainLayer");
    if(!r || r.dataset.ready) return;
    r.dataset.ready = "1";
    for(let i=0;i<80;i++){
      const d = document.createElement("div");
      d.className = "drop";
      d.style.left = Math.random()*100 + "%";
      d.style.animationDuration = (.6+Math.random()*.7)+"s";
      d.style.animationDelay = Math.random()*2+"s";
      r.appendChild(d);
    }
    const syms = ["∫","π","√","Σ","Δ","f(x)","lim","x²","∞"];
    const layer = $("symbolLayer");
    if(layer){
      for(let i=0;i<26;i++){
        const s = document.createElement("span");
        s.className = "sym";
        s.textContent = syms[i%syms.length];
        s.style.left = Math.random()*100+"%";
        s.style.top = Math.random()*100+"%";
        s.style.fontSize = (24+Math.random()*58)+"px";
        layer.appendChild(s);
      }
    }
  }

  // Binds
  if($("loginTab")) $("loginTab").onclick = () => setAuthMode("login");
  if($("registerTab")) $("registerTab").onclick = () => setAuthMode("register");
  if($("authSubmit")) $("authSubmit").onclick = () => mode === "login" ? signIn() : register();
  if($("guestBtn")) $("guestBtn").onclick = continueGuest;
  if($("forgotBtn")) $("forgotBtn").onclick = forgot;

  if($("mainToggleBtn")) $("mainToggleBtn").onclick = toggle;
  if($("resetBtn")) $("resetBtn").onclick = reset;
  if($("fullscreenBtn")) $("fullscreenBtn").onclick = enterFullscreenFocus;
  if($("overlayToggleBtn")) $("overlayToggleBtn").onclick = toggle;
  if($("overlayResetBtn")) $("overlayResetBtn").onclick = reset;
  if($("overlayExitBtn")) $("overlayExitBtn").onclick = exitFullscreenFocus;

  if($("addTaskBtn")) $("addTaskBtn").onclick = addDailyTask;
  if($("clearDoneTasksBtn")) $("clearDoneTasksBtn").onclick = clearDoneTasks;
  if($("clearTasksBtn")) $("clearTasksBtn").onclick = clearDailyTasks;
  if($("addNoteBtn")) $("addNoteBtn").onclick = addNote;
  if($("addExamTaskBtn")) $("addExamTaskBtn").onclick = addExamTask;

  document.querySelectorAll(".mode").forEach(btn=>{
    btn.onclick = () => {
      document.querySelectorAll(".mode").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      focusSeconds = Number(btn.dataset.min)*60;
      totalSeconds = focusSeconds;
      remaining = totalSeconds;
      reset();
    };
  });

  document.querySelectorAll(".break-btn").forEach(btn=>btn.onclick = () => startBreak(Number(btn.dataset.break)));
  if($("breakStartPauseBtn")) $("breakStartPauseBtn").onclick = toggleBreakTimer;
  if($("breakFinishBtn")) $("breakFinishBtn").onclick = () => finishBreak(true);

  document.querySelectorAll(".track").forEach(btn=>{
    btn.onclick = () => {
      const was = isAudioPlaying;
      pauseAudio();
      setTrack(btn.dataset.track);
      if(was) playAudio();
    };
  });

  document.querySelectorAll("#dailyTargetOptions button").forEach(btn=>btn.onclick = () => changeDailyTarget(btn.dataset.target));

  if($("volumeRange")) $("volumeRange").oninput = e => {
    const a = $("focusAudio");
    if(a) a.volume = e.target.value/100;
    if($("volumeText")) $("volumeText").textContent = "🔊 " + e.target.value + "%";
  };

  if($("examGroupSelect")) $("examGroupSelect").onchange = changeExamGroup;
  if($("examTypeSelect")) $("examTypeSelect").onchange = changeExamType;
  if($("saveExamBtn")) $("saveExamBtn").onclick = saveExamSettings;
  if($("toggleExamBtn")) $("toggleExamBtn").onclick = toggleExamPanel;

  if($("settingsBtn")) $("settingsBtn").onclick = () => $("settingsPanel").classList.toggle("show");
  if($("closeSettingsBtn")) $("closeSettingsBtn").onclick = () => $("settingsPanel").classList.remove("show");
  if($("compactModeBtn")) $("compactModeBtn").onclick = toggleCompactMode;
  if($("logoutBtn")) $("logoutBtn").onclick = () => {
    localStorage.removeItem("sezr_guest_mode");
    guestMode = false;
    if(auth && user) auth.signOut();
    else showAuth();
  };

  if($("closeModalBtn")) $("closeModalBtn").onclick = () => { $("successModal").classList.remove("show"); reset(); };

  document.addEventListener("keydown", e => {
    const tag = (e.target.tagName || "").toLowerCase();
    if(e.key === "Escape" && $("breakModal") && $("breakModal").classList.contains("show")){ finishBreak(true); return; }
    if(e.key === "Escape" && $("focusOverlay") && $("focusOverlay").classList.contains("show")){ exitFullscreenFocus(); return; }
    if(e.key === "Enter" && e.target && e.target.id === "taskInput"){ e.preventDefault(); addDailyTask(); return; }
    if(tag === "input" || tag === "textarea") return;
    if(e.code === "Space"){ e.preventDefault(); toggle(); }
  });

  if($("focusOverlay")){
    ["mousemove","touchstart","click"].forEach(evt=>$("focusOverlay").addEventListener(evt, showOverlayControls));
  }

  document.addEventListener("click", e => {
    const panel = $("settingsPanel");
    const btn = $("settingsBtn");
    if(!panel || !btn || !panel.classList.contains("show")) return;
    if(!panel.contains(e.target) && !btn.contains(e.target)) panel.classList.remove("show");
  });

  setInterval(()=>renderExamCountdown(),1000);
  setInterval(()=>{ if($("focusOverlay") && $("focusOverlay").classList.contains("show")) showQuote(); },18000);

  makeRain();
  setTrack("rain");
  applyCompactMode();

  if(localStorage.getItem("sezr_guest_mode") === "1"){
    continueGuest();
  }else if(auth){
    auth.onAuthStateChanged(async current => {
      user = current;
      if(user){
        guestMode = false;
        showApp();
        await loadCloud();
      }else{
        showAuth();
      }
    });
  }else{
    showAuth();
    showMessage("Firebase hazır değil. Misafir devam et.","error");
  }
});