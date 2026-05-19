document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const cfg = window.SEZR_FOCUS_CONFIG || {};
  const firebaseReady = !!(cfg.firebaseEnabled && window.firebase && cfg.firebase && cfg.firebase.apiKey);

  let app = null, auth = null, db = null, user = null;
  let guestMode = localStorage.getItem("sezr_guest_mode") === "1";
  if(firebaseReady){
    app = firebase.initializeApp(cfg.firebase);
    auth = firebase.auth();
    db = firebase.firestore();
  }

  const tracks = {
    rain:{title:"Rain Focus",file:"focus-rain.mp3",theme:"theme-rain"},
    lofi:{title:"Lo-fi",file:"focus-lofi.mp3",theme:"theme-lofi"},
    piano:{title:"Piano",file:"focus-piano.mp3",theme:"theme-piano"},
    relax:{title:"Relax",file:"focus-relax.mp3",theme:"theme-relax"},
    jazz:{title:"Jazz",file:"focus-jazz.mp3",theme:"theme-jazz"},
    fire:{title:"Fire",file:"focus-fire.mp3",theme:"theme-fire"}
  };

  let data = blank();
  let currentTrack = "rain";
  let running = false;
  let isBreak = false;
  let isAudioPlaying = false;
  let timerId = null;
  let focusSeconds = 25 * 60;
  let totalSeconds = focusSeconds;
  let remaining = totalSeconds;
  let mode = "login";
  let overlayVisibleTimer = null;
  let quoteTimer = null;
  let pausedFocusRemaining = null;
  let pausedFocusTotal = null;
  let breakTimerId = null;
  let breakRemaining = 5 * 60;
  let breakTotal = 5 * 60;
  let breakRunning = false;
  let saveTimer = null;
  let saveBusy = false;

  function blank(){ return {name:"",email:"",tasks:[],dailyTarget:60,exam:{group:"YKS",type:"TYT",date:"2026-06-20",hidden:false},notes:[],taskHistory:[],totalSeconds:0,totalPomodoros:0,days:{}}; }
  function localKey(){ return user ? "sezr_focus_cloud_" + user.uid : "sezr_focus_guest"; }
  function saveLocal(){ localStorage.setItem(localKey(), JSON.stringify(data)); }
  function loadLocal(){ try{return Object.assign(blank(), JSON.parse(localStorage.getItem(localKey()) || "{}"));}catch{return blank();} }
  function userDoc(){ return db.collection("focusUsers").doc(user.uid); }
  function today(){ return new Date().toISOString().slice(0,10); }
  function day(){ const k=today(); if(!data.days[k]) data.days[k]={seconds:0,pomodoros:0,pauses:0}; return data.days[k]; }
  function fmt(sec){ const m=Math.floor(sec/60), s=sec%60; return String(m).padStart(2,"0")+":"+String(s).padStart(2,"0"); }
  function paths(track){ const f=tracks[track].file; return ["music/"+f,f,"./music/"+f,"./"+f]; }
  function showMessage(msg,type=""){
    const el = $("authMessage");
    if(!el) return;
    el.textContent = msg || "";
    el.className = "auth-message" + (type ? " " + type : "");
  }

  async function loadCloud(){
    data = loadLocal();
    if(!guestMode && user && db){
      try{
        const snap = await userDoc().get();
        if(snap.exists){
          data = Object.assign(blank(), snap.data());
          saveLocal();
        }else{
          data.email = user.email || "";
          await saveCloud();
        }
      }catch(e){
        console.warn("Firestore okunamadı, yerel kayıtla devam:", e);
        data.email = user.email || data.email || "";
      }
    }
    render();
  }

  async function saveCloudNow(){
    saveLocal();
    if(!user || !db || saveBusy) return;
    saveBusy = true;
    try{
      await userDoc().set(data, {merge:true});
    }catch(e){
      console.warn("Cloud save delayed:", e);
    }finally{
      saveBusy = false;
    }
  }

  function queueSave(){
    saveLocal();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveCloudNow, 1200);
  }

  async function saveCloud(){
    queueSave();
  }

  async function signIn(){
    const email = $("authEmail").value.trim().toLowerCase();
    const pass = $("authPassword").value;
    if(!email || !pass){ showMessage("Mail ve şifre gir.","error"); return; }
    if(!auth){ showMessage("Firebase hazır değil. Misafir olarak devam edebilirsin.","error"); return; }

    try{
      $("authSubmit").disabled = true;
      showMessage("Giriş yapılıyor...");
      await Promise.race([
        auth.signInWithEmailAndPassword(email, pass),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 12000))
      ]);
      localStorage.removeItem("sezr_guest_mode");
      guestMode = false;
      showMessage("Giriş başarılı.","success");
    }catch(e){
      if(e.message === "timeout") showMessage("Giriş uzun sürdü. Bağlantıyı kontrol et veya misafir devam et.","error");
      else showMessage(errorText(e),"error");
    }finally{
      $("authSubmit").disabled = false;
    }
  }

  async function register(){
    const email = $("authEmail").value.trim().toLowerCase();
    const pass = $("authPassword").value;
    if(!email || !pass || pass.length < 6){ showMessage("Mail gir ve en az 6 karakter şifre yaz.","error"); return; }
    if(!auth){ showMessage("Firebase hazır değil. Misafir olarak devam edebilirsin.","error"); return; }

    try{
      $("authSubmit").disabled = true;
      showMessage("Hesap oluşturuluyor...");
      const result = await Promise.race([
        auth.createUserWithEmailAndPassword(email, pass),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 12000))
      ]);
      localStorage.removeItem("sezr_guest_mode");
      guestMode = false;
      user = result.user;
      data = blank();
      data.email = email;
      await saveCloud();
      showMessage("Hesap oluşturuldu.","success");
    }catch(e){
      if(e.message === "timeout") showMessage("Hesap oluşturma uzun sürdü. Email/Password açık mı kontrol et.","error");
      else showMessage(errorText(e),"error");
    }finally{
      $("authSubmit").disabled = false;
    }
  }

  async function forgot(){
    const email = $("authEmail").value.trim().toLowerCase();
    if(!email){ showMessage("Şifre sıfırlamak için mail adresini yaz.","error"); return; }
    try{
      await auth.sendPasswordResetEmail(email);
      showMessage("Şifre sıfırlama maili gönderildi.","success");
    }catch(e){ showMessage(errorText(e),"error"); }
  }

  function continueGuest(){
    guestMode = true;
    user = null;
    localStorage.setItem("sezr_guest_mode","1");
    data = loadLocal();
    showApp();
    render();
  }

  function errorText(e){
    const code = e && e.code ? e.code : "";
    if(code.includes("user-not-found")) return "Bu mail ile hesap bulunamadı.";
    if(code.includes("wrong-password") || code.includes("invalid-credential")) return "Mail veya şifre hatalı.";
    if(code.includes("email-already-in-use")) return "Bu mail ile zaten hesap var.";
    if(code.includes("weak-password")) return "Şifre en az 6 karakter olmalı.";
    if(code.includes("operation-not-allowed")) return "Firebase Authentication içinde Email/Password girişini açmalısın.";
    return "İşlem yapılamadı: " + (e.message || code);
  }

  function setAuthMode(next){
    mode = next;
    $("loginTab").classList.toggle("active", mode==="login");
    $("registerTab").classList.toggle("active", mode==="register");
    $("authSubmit").textContent = mode==="login" ? "Giriş Yap" : "Hesap Oluştur";
    showMessage("");
  }

  function showApp(){
    $("authScreen").classList.add("hidden");
    $("appPage").classList.remove("hidden");
    $("settingsBtn").classList.remove("hidden");
  }

  function showAuth(){
    $("authScreen").classList.remove("hidden");
    $("appPage").classList.add("hidden");
    $("settingsBtn").classList.add("hidden");
    $("settingsPanel").classList.remove("show");
  }

  function setTrack(track){
    currentTrack = track;
    const t = tracks[track];
    document.body.className = document.body.className.replace(/theme-\w+/g,"").trim();
    document.body.classList.add(t.theme);
    $("trackTitle").textContent = t.title;
    $("trackStatus").textContent = "Müzik sayaçla birlikte başlar ve durur.";
    $("rainLayer").style.display = track === "rain" ? "block" : "none";
    document.querySelectorAll(".track").forEach(b=>b.classList.toggle("active", b.dataset.track===track));
  }

  function tryAudio(list, i=0){
    if(isBreak) return forceStopAudio();
    if(i>=list.length){ $("trackStatus").textContent="Ses dosyası bulunamadı."; return; }
    const audio=$("focusAudio");
    audio.src=list[i];
    audio.volume=$("volumeRange").value/100;
    audio.play().then(()=>{
      isAudioPlaying=true;
      document.querySelector(".music-panel").classList.remove("paused");
      $("trackStatus").textContent="Çalıyor";
    }).catch(()=>tryAudio(list,i+1));
  }

  function playAudio(){ if(!isBreak && !isAudioPlaying) tryAudio(paths(currentTrack)); }
  function pauseAudio(){ if(isAudioPlaying){ $("focusAudio").pause(); isAudioPlaying=false; document.querySelector(".music-panel").classList.add("paused"); $("trackStatus").textContent="Duraklatıldı"; } }
  function forceStopAudio(){ const a=$("focusAudio"); a.pause(); a.currentTime=0; isAudioPlaying=false; document.querySelector(".music-panel").classList.add("paused"); $("trackStatus").textContent="Mola sırasında ses kapalı"; }

  function playAlarm(){
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(!Ctx) return;
    const ctx = new Ctx();
    const gain = ctx.createGain();
    gain.gain.value = 0.08;
    gain.connect(ctx.destination);
    let count = 0;
    const beep = () => {
      const osc = ctx.createOscillator();
      osc.frequency.value = 880;
      osc.connect(gain);
      osc.start();
      setTimeout(()=>osc.stop(),260);
      count++;
      if(count < 5) setTimeout(beep,1000);
      else setTimeout(()=>ctx.close(),1500);
    };
    beep();
  }

  function start(){
    if(running) return;
    running=true;
    $("timerStatus").textContent = isBreak ? "Mola" : "Çalışıyor";
    if(isBreak) forceStopAudio(); else playAudio();
    timerId=setInterval(()=>{
      if(remaining>0){
        remaining--;
        if(!isBreak){
          day().seconds++;
          data.totalSeconds++;
          queueSave();
        }
        render();
      }else finish();
    },1000);
    render();
  }

  function pause(){
    if(!running) return;
    clearInterval(timerId);
    running=false;
    if(!isBreak){ day().pauses++; queueSave(); }
    pauseAudio();
    $("timerStatus").textContent="Duraklatıldı";
    render();
  }

  function toggle(){ running ? pause() : start(); }

  function reset(){
    clearInterval(timerId);
    running=false;
    isBreak=false;
    clearInterval(breakTimerId);
    breakRunning = false;
    closeBreakModal();
    pausedFocusRemaining = null;
    pausedFocusTotal = null;
    totalSeconds=focusSeconds;
    remaining=totalSeconds;
    pauseAudio();
    $("timerStatus").textContent="Hazır";
    render();
  }

  function startBreak(min){
    if(isBreak){
      openBreakModal();
      return;
    }

    clearInterval(timerId);
    running = false;
    pauseAudio();

    pausedFocusRemaining = remaining;
    pausedFocusTotal = totalSeconds;

    isBreak = true;
    breakTotal = min * 60;
    breakRemaining = breakTotal;
    breakRunning = false;
    clearInterval(breakTimerId);

    $("timerStatus").textContent = "Mola";
    forceStopAudio();
    openBreakModal();
    render();
  }

  function openBreakModal(){
    const modal = $("breakModal");
    if(modal){
      modal.classList.add("show");
      requestNativeFullscreen(modal);
    }
    updateBreakModal();
  }

  function closeBreakModal(){
    const modal = $("breakModal");
    if(modal) modal.classList.remove("show");
    if(document.fullscreenElement === modal || document.webkitFullscreenElement === modal){
      exitNativeFullscreen();
    }
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
        finishBreakAndResume(false);
      }
    },1000);
  }

  function finishBreakAndResume(manual=true){
    clearInterval(breakTimerId);
    breakRunning = false;
    isBreak = false;

    totalSeconds = pausedFocusTotal || focusSeconds;
    remaining = pausedFocusRemaining !== null ? pausedFocusRemaining : totalSeconds;
    pausedFocusRemaining = null;
    pausedFocusTotal = null;

    closeBreakModal();
    forceStopAudio();
    if(!manual) playAlarm();
    $("timerStatus").textContent = manual ? "Moladan döndün" : "Mola bitti";
    render();
  }

  async function finish(){
    clearInterval(timerId);
    running=false;

    if(isBreak){
      finishBreakAndResume(false);
      return;
    }

    day().pomodoros++;
    data.totalPomodoros++;
    data.sessions.unshift(new Date().toLocaleString("tr-TR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})+" • "+Math.round(focusSeconds/60)+" dk");
    data.sessions=data.sessions.slice(0,8);
    queueSave();

    if($("autoBreak").checked) startBreak(5);
    else { 
      pauseAudio(); 
      const modalBox = document.querySelector(".modal-box");
      if(modalBox && !modalBox.querySelector(".mini-result")){
        const div = document.createElement("div");
        div.className = "mini-result";
        modalBox.insertBefore(div, modalBox.querySelector("button"));
      }
      const result = document.querySelector(".modal-box .mini-result");
      if(result) result.textContent = buildTodaySummary();
      showMotivationQuote();
      $("successModal").classList.add("show"); 
      $("timerStatus").textContent="Tamamlandı"; 
      render(); 
    }
  }

  function score(){
    const d=day(), min=Math.floor(d.seconds/60);
    if(min===0 && d.pomodoros===0) return 0;
    return Math.max(5, Math.min(100, 30 + Math.min(45,min) + Math.min(40,d.pomodoros*15) - Math.min(25,d.pauses*5)));
  }

  function streak(){
    let count=0, d=new Date();
    while(true){
      const k=d.toISOString().slice(0,10);
      if(data.days[k] && data.days[k].seconds>=60){ count++; d.setDate(d.getDate()-1); }
      else break;
    }
    return count;
  }

  function getTasks(){
    data.tasks = Array.isArray(data.tasks) ? data.tasks : [];
    return data.tasks;
  }

  function taskStats(){
    const tasks = getTasks();
    const total = tasks.length;
    const done = tasks.filter(t=>t.done).length;
    const pct = total ? Math.round(done / total * 100) : 0;
    return {total,done,pct};
  }

  function mainTaskText(){
    const tasks = getTasks();
    if(tasks.length === 0) return "Görev eklenmedi";
    return tasks.map(t => (t.done ? "✓ " : "• ") + t.text).join(" / ");
  }

  function advice(){
    const d=day(), min=Math.floor(d.seconds/60);
    const ts = taskStats();
    const rhythmStats = typeof getLast7Stats === "function" ? getLast7Stats() : [];
    const avgMin = rhythmStats.length ? Math.round(rhythmStats.reduce((s,x)=>s+x.minutes,0)/7) : 0;
    if(ts.total === 0 && min===0) return "Bir görev ekleyip odak seansına başla.";
    if(ts.total > 0 && ts.done === ts.total) return "Bugünkü görevler tamamlandı.";
    if(ts.total > 0 && min===0) return "Görevlerin hazır. Şimdi 25 dakika sadece ilk göreve odaklan.";
    if(min<60){
      if(avgMin && min < avgMin) return "Ritmi korumak için bir seans daha ekle.";
      return "Bir kısa seans daha ekleyebilirsin.";
    }
    return "Günlük hedef tamamlandı.";
  }

  let latestExamSuggestion = "20 soru çöz ve yanlışlarını işaretle.";

  const examOptions = {
    YKS: [
      {value:"TYT", label:"TYT", date:"2026-06-20"},
      {value:"AYT", label:"AYT", date:"2026-06-21"},
      {value:"YDT", label:"YDT / Dil", date:"2026-06-21"}
    ],
    LGS: [
      {value:"LGS", label:"LGS", date:"2026-06-14"}
    ],
    KPSS: [
      {value:"KPSS", label:"KPSS", date:"2026-09-06"}
    ],
    DGS: [
      {value:"DGS", label:"DGS", date:"2026-07-19"}
    ]
  };

  function ensureExam(){
    data.exam = data.exam || {group:"YKS",type:"TYT",date:"2026-06-20",hidden:false};
    if(!data.exam.group) data.exam.group = "YKS";
    if(!data.exam.type) data.exam.type = "TYT";
    if(!data.exam.date) data.exam.date = "2026-06-20";
    if(typeof data.exam.hidden !== "boolean") data.exam.hidden = false;
  }

  function renderExamTypeOptions(){
    ensureExam();
    const typeSelect = $("examTypeSelect");
    if(!typeSelect) return;
    const group = data.exam.group || "YKS";
    const opts = examOptions[group] || examOptions.YKS;
    typeSelect.innerHTML = "";
    opts.forEach(opt=>{
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      typeSelect.appendChild(o);
    });
    if(!opts.some(x=>x.value === data.exam.type)){
      data.exam.type = opts[0].value;
      data.exam.date = opts[0].date;
    }
    typeSelect.value = data.exam.type;
  }

  function renderExamCountdown(){
    ensureExam();
    const panel = $("examCountdownPanel");
    if(!panel) return;

    renderExamTypeOptions();

    $("examGroupSelect").value = data.exam.group;
    $("examDateInput").value = data.exam.date;
    panel.classList.toggle("collapsed", data.exam.hidden);
    $("toggleExamBtn").textContent = data.exam.hidden ? "Göster" : "Gizle";

    const label = (examOptions[data.exam.group] || []).find(x=>x.value === data.exam.type)?.label || data.exam.type;
    $("examSubtitle").textContent = label + " için kalan süre";

    const target = new Date(data.exam.date + "T10:00:00");
    const diff = target.getTime() - Date.now();

    if(diff <= 0){
      $("examDays").textContent = "0";
      $("examHours").textContent = "0";
      $("examMinutes").textContent = "0";
      if($("examSeconds")) $("examSeconds").textContent = "0";
      $("examAdvice").textContent = "Seçilen tarih geçmiş görünüyor. Yeni tarih seçebilirsin.";
      if($("examMiniPlan")) $("examMiniPlan").innerHTML = "";
      if($("studyIntensity")) $("studyIntensity").textContent = "";
      return;
    }

    const totalSecondsLeft = Math.floor(diff / 1000);
    const days = Math.floor(totalSecondsLeft / (60*60*24));
    const hours = Math.floor((totalSecondsLeft % (60*60*24)) / (60*60));
    const minutes = Math.floor((totalSecondsLeft % (60*60)) / 60);
    const seconds = totalSecondsLeft % 60;

    $("examDays").textContent = days;
    $("examHours").textContent = hours;
    $("examMinutes").textContent = minutes;
    if($("examSeconds")) $("examSeconds").textContent = seconds;

    let advice = "Bugün küçük ama net bir çalışma planı seç.";
    if(days > 120) advice = "Zaman var. Konu eksiklerini kapatmaya odaklan.";
    else if(days > 60) advice = "Deneme + konu tekrarı dengesini kur.";
    else if(days > 30) advice = "Yanlış analizi ve süre yönetimine ağırlık ver.";
    else if(days > 7) advice = "Yeni konu azalt, tekrar ve deneme analizini artır.";
    else advice = "Son hafta: hafif tekrar, uyku düzeni ve moral önemli.";

    $("examAdvice").textContent = advice;

    const mini = $("examMiniPlan");
    if(mini){
      let s1 = "Konu tekrarı";
      let s2 = "Soru pratiği";
      let s3 = "Yanlış analizi";

      if(days <= 30){
        s1 = "Deneme analizi";
        s2 = "Eksik konu tekrarı";
        s3 = "Süre kontrolü";
      }
      if(days <= 7){
        s1 = "Hafif tekrar";
        s2 = "Uyku düzeni";
        s3 = "Moral koruma";
      }

      latestExamSuggestion = s1 + " + " + s2 + " + " + s3;

      mini.innerHTML =
        '<div class="exam-mini-step"><b>1</b><span>'+s1+'</span></div>' +
        '<div class="exam-mini-step"><b>2</b><span>'+s2+'</span></div>' +
        '<div class="exam-mini-step"><b>3</b><span>'+s3+'</span></div>';
    }

    const intensity = $("studyIntensity");
    if(intensity){
      const todayMin = Math.floor((day().seconds || 0) / 60);
      let suggested = 45;
      if(days > 120) suggested = 45;
      else if(days > 60) suggested = 60;
      else if(days > 30) suggested = 75;
      else if(days > 7) suggested = 90;
      else suggested = 60;

      intensity.classList.remove("good","warn");
      let text = "Önerilen günlük çalışma: " + suggested + " dk.";
      if(todayMin >= suggested){
        intensity.classList.add("good");
        text += " Bugün bu seviyeyi yakaladın.";
      }else if(todayMin > 0){
        intensity.classList.add("warn");
        text += " Bugün kalan öneri: " + Math.max(0, suggested - todayMin) + " dk.";
      }else{
        text += " Bugün henüz başlamadın.";
      }
      intensity.textContent = text;
    }
  }

  async function saveExamSettings(){
    ensureExam();
    data.exam.group = $("examGroupSelect").value;
    data.exam.type = $("examTypeSelect").value;
    data.exam.date = $("examDateInput").value || data.exam.date;
    await saveCloud();
    render();
  }

  async function changeExamGroup(){
    ensureExam();
    data.exam.group = $("examGroupSelect").value;
    const first = examOptions[data.exam.group][0];
    data.exam.type = first.value;
    data.exam.date = first.date;
    await saveCloud();
    render();
  }

  async function changeExamType(){
    ensureExam();
    data.exam.type = $("examTypeSelect").value;
    const found = (examOptions[data.exam.group] || []).find(x=>x.value === data.exam.type);
    if(found) data.exam.date = found.date;
    await saveCloud();
    render();
  }

  async function toggleExamPanel(){
    ensureExam();
    data.exam.hidden = !data.exam.hidden;
    await saveCloud();
    render();
  }

  function last7Days(){
    const arr = [];
    const now = new Date();
    for(let i=6;i>=0;i--){
      const d = new Date(now);
      d.setDate(now.getDate()-i);
      arr.push({
        key:d.toISOString().slice(0,10),
        label:d.toLocaleDateString("tr-TR",{weekday:"short"})
      });
    }
    return arr;
  }

  function renderWeekly(){
    const box = $("weekBars");
    const totalEl = $("weeklyTotal");
    if(!box) return;
    const days = last7Days();
    let total = 0;
    const maxMin = Math.max(60, ...days.map(x => Math.floor(((data.days[x.key]||{}).seconds||0)/60)));
    box.innerHTML = "";
    days.forEach(x=>{
      const d = data.days[x.key] || {seconds:0,pomodoros:0};
      const min = Math.floor((d.seconds||0)/60);
      total += min;
      const h = Math.max(20, Math.round((min/maxMin)*130));
      const item = document.createElement("div");
      item.className = "week-day" + (x.key === today() ? " active-today" : "");
      item.innerHTML = '<div class="week-bar" style="height:'+h+'px"></div><b>'+min+' dk</b><span>'+x.label+'</span>';
      box.appendChild(item);
    });
    if(totalEl) totalEl.textContent = total + " dk";
    const insight = $("weeklyInsight");
    if(insight){
      const activeDays = days.filter(x => ((data.days[x.key]||{}).seconds||0) > 0).length;
      let msg = "Bu hafta henüz düzenli veri oluşmadı.";
      if(total > 0){
        msg = "Bu hafta " + activeDays + " gün çalıştın. Toplam süre: " + total + " dk.";
        if(activeDays >= 5) msg += " Güzel bir ritim yakalanmış.";
        else if(activeDays >= 3) msg += " Ritmi korumak için 1-2 gün daha eklenebilir.";
        else msg += " Düzen için kısa seanslarla gün sayısını artır.";
      }
      insight.textContent = msg;
    }
  }

  async function changeDailyTarget(value){
    data.dailyTarget = Number(value || 60);
    await saveCloud();
    render();
  }

  async function togglePlanDone(){
    const d = day();
    d.planDone = !d.planDone;
    await saveCloud();
    render();
  }

  function getLast7Stats(){
    const arr = [];
    const now = new Date();
    for(let i=6;i>=0;i--){
      const d = new Date(now);
      d.setDate(now.getDate()-i);
      const key = d.toISOString().slice(0,10);
      const dayData = data.days[key] || {seconds:0,pomodoros:0};
      arr.push({
        key,
        minutes: Math.floor((dayData.seconds || 0) / 60),
        pomodoros: dayData.pomodoros || 0
      });
    }
    return arr;
  }

  function renderRhythm(){
    const avgEl = $("weeklyAverage");
    const bestEl = $("bestDay");
    const textEl = $("rhythmText");
    if(!avgEl || !bestEl || !textEl) return;

    const card = document.querySelector(".rhythm-card");
    let statusLine = document.getElementById("rhythmStatusLine");
    if(card && !statusLine){
      statusLine = document.createElement("div");
      statusLine.id = "rhythmStatusLine";
      statusLine.className = "rhythm-status-line";
      card.appendChild(statusLine);
    }

    const stats = getLast7Stats();
    const total = stats.reduce((s,x)=>s+x.minutes,0);
    const avg = Math.round(total / 7);
    const best = Math.max(0, ...stats.map(x=>x.minutes));
    const todayMin = Math.floor((day().seconds || 0) / 60);

    avgEl.textContent = avg + " dk";
    bestEl.textContent = best + " dk";
    if(card) card.classList.toggle("not-ready", total === 0);

    let msg = "Ritim analizi için birkaç seans gerekli.";
    if(total > 0){
      if(todayMin === 0) msg = "Bugün henüz başlamadın. Kısa bir seans ritmi korur.";
      else if(todayMin >= avg && avg > 0) msg = "Bugün haftalık ortalamanı yakaladın. Güzel tempo.";
      else if(todayMin < avg && avg > 0) msg = "Bugün ortalamanın altındasın. Bir kısa seans daha iyi olur.";
      if(best > 0 && todayMin >= best) msg = "Bugün haftanın en iyi çalışma günlerinden biri olabilir.";
    }
    textEl.textContent = msg;
    if(statusLine){
      statusLine.textContent = total > 0
        ? "Çalışma ritmi aktif."
        : "Çalışma ritmi için biraz veri gerekli.";
    }
  }

  const motivationQuotes = [
    "Sadece bu seans.",
    "Telefon yok, bahane yok.",
    "Küçük adım, büyük fark.",
    "Şimdi odak zamanı.",
    "Bir soru daha.",
    "Dikkatini koru.",
    "Seans bitene kadar buradasın."
  ];

  function requestNativeFullscreen(el){
    if(!el) return;
    if(el.requestFullscreen) el.requestFullscreen().catch(()=>{});
    else if(el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  }

  function exitNativeFullscreen(){
    if(document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(()=>{});
    else if(document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
  }

  function enterFullscreenFocus(){
    const overlay = $("focusOverlay");
    if(!overlay) return;
    overlay.classList.add("show","controls-visible");
    document.body.classList.add("overlay-open");
    requestNativeFullscreen(overlay);
    showOverlayControls();
    showMotivationQuote();
  }

  function exitFullscreenFocus(){
    const overlay = $("focusOverlay");
    if(!overlay) return;
    overlay.classList.remove("show","controls-visible");
    document.body.classList.remove("overlay-open");
    clearTimeout(overlayVisibleTimer);
    clearInterval(quoteTimer);
    exitNativeFullscreen();
  }

  function showOverlayControls(){
    const overlay = $("focusOverlay");
    if(!overlay) return;
    overlay.classList.add("controls-visible");
    clearTimeout(overlayVisibleTimer);
    overlayVisibleTimer = setTimeout(()=>{
      if(overlay.classList.contains("show")) overlay.classList.remove("controls-visible");
    }, 2600);
  }

  function showMotivationQuote(){
    const q = $("overlayQuote");
    if(!q) return;
    const pick = motivationQuotes[Math.floor(Math.random()*motivationQuotes.length)];
    q.textContent = pick;
    q.classList.add("show");
    setTimeout(()=>q.classList.remove("show"), 4200);
  }

  function startQuoteLoop(){
    clearInterval(quoteTimer);
    quoteTimer = setInterval(()=>{
      if($("focusOverlay") && $("focusOverlay").classList.contains("show")){
        showMotivationQuote();
      }
    }, 18000);
  }

  function applyCompactMode(){
    document.body.classList.toggle("compact-ui", localStorage.getItem("sezr_compact_ui") === "1");
    if($("compactModeBtn")){
      $("compactModeBtn").textContent = document.body.classList.contains("compact-ui") ? "Standart Görünüm" : "Sade Görünüm";
    }
  }

  function toggleCompactMode(){
    const next = localStorage.getItem("sezr_compact_ui") === "1" ? "0" : "1";
    localStorage.setItem("sezr_compact_ui", next);
    applyCompactMode();
  }

  function render(){
    const d=day();
    const min=Math.floor(d.seconds/60);
    const target = Number(data.dailyTarget || 60);
    const pct=Math.min(100,Math.round(min/target*100));
    $("timerText").textContent=fmt(remaining);
    if($("overlayTimer")) $("overlayTimer").textContent = fmt(remaining);
    if($("overlayStatus")) $("overlayStatus").textContent = isBreak ? "Mola" : (running ? "Çalışıyor" : "Hazır");
    if($("overlaySubStatus")){
      if(isBreak) $("overlaySubStatus").textContent = "Moladan sonra kaldığın yerden devam.";
      else if(running) $("overlaySubStatus").textContent = "Odak modundasın.";
      else if(remaining < totalSeconds) $("overlaySubStatus").textContent = "Kaldığın yerden devam edebilirsin.";
      else $("overlaySubStatus").textContent = "Başlamak için hazır.";
    }
    if($("overlayTaskProgress")){
      const ts = taskStats();
      $("overlayTaskProgress").textContent = "Görev: " + ts.done + "/" + ts.total + " • %" + ts.pct;
    }
    $("timerRing").style.setProperty("--progress", ((totalSeconds-remaining)/totalSeconds*360)+"deg");
    $("mainToggleBtn").textContent = running ? "Duraklat" : (remaining<totalSeconds ? "Devam Et" : "Başlat");
    $("mainToggleBtn").classList.toggle("running", running);
    if($("overlayToggleBtn")){
      $("overlayToggleBtn").textContent = running ? "Duraklat" : (remaining<totalSeconds ? "Devam Et" : "Başlat");
      $("overlayToggleBtn").classList.toggle("running", running);
    }
    renderDailyTasks();
    $("aiAdvice").textContent = advice();
    $("todayMinutes").textContent = min+" dk";
    $("todayPomodoros").textContent = d.pomodoros;
    $("focusScore").textContent = score()+"%";
    $("streakDays").textContent = streak();
    if($("taskCompletion")) $("taskCompletion").textContent = taskStats().pct + "%";
    $("progressFill").style.width = pct+"%";
    $("progressText").textContent = min+" / "+target+" dk • %"+pct;
    document.querySelectorAll("#dailyTargetOptions button").forEach(btn=>{
      btn.classList.toggle("active", Number(btn.dataset.target) === target);
    });
    if($("focusLevel")){
      let level = "Başlangıç seviyesi";
      if(min >= target) level = "Günlük hedef tamamlandı";
      else if(min >= target*0.66) level = "Güçlü odak seviyesi";
      else if(min >= target*0.33) level = "İyi ilerleme";
      $("focusLevel").textContent = level;
    }
    if($("targetAdvice")){
      let msg = "Hedefe başlamak için ilk seansı başlat.";
      if(min > 0 && min < target) msg = "Hedefe kalan süre: " + Math.max(0,target-min) + " dk.";
      if(min >= target) msg = "Bugünkü süre hedefi tamamlandı. Artık tekrar veya yanlış analizi yapabilirsin.";
      $("targetAdvice").textContent = msg;
    }
    if($("planProgressFill")){
      const planPct = d.planDone ? 100 : Math.min(90, pct);
      $("planProgressFill").style.width = planPct + "%";
      $("planProgressText").textContent = "Plan ilerlemesi: %" + planPct;
    }
    $("accountEmail").textContent = guestMode ? "Misafir mod" : (user ? user.email : "");
    if($("profileChip")){
      $("profileChip").textContent = guestMode ? "Misafir Mod" : (user ? user.email : "Hesap");
    }
    if($("startHint")){
      $("startHint").classList.toggle("hidden", localStorage.getItem("sezr_hide_start_hint") === "1");
    }
renderNotes();

  }

  function buildTodaySummary(){
    const d = day();
    const min = Math.floor((d.seconds || 0) / 60);
    const plan = mainTaskText();
    const ts = taskStats();
    const done = ts.total > 0 && ts.done === ts.total ? "tamamlandı" : "devam ediyor";
    const subject = "";
    const exam = data.exam && data.exam.type ? " • Sınav: " + data.exam.type : "";
    return "Görevler: " + plan + subject + exam + " • Durum: " + done + " • Tamamlama: %" + ts.pct + " • Süre: " + min + " dk • Pomodoro: " + (d.pomodoros || 0);
  }

  function renderTodaySummary(){
    const el = $("todaySummaryText");
    if(el) el.textContent = buildTodaySummary();
  }

  function copyTodaySummary(){
    const text = "SezR Focus Günlük Özet\\n" + buildTodaySummary();
    if(navigator.clipboard){
      navigator.clipboard.writeText(text).then(()=>alert("Özet kopyalandı."));
    }else{
      prompt("Özeti kopyala:", text);
    }
  }

  function renderTaskHistory(){
    const box = $("taskHistoryList");
    if(!box) return;
    const list = data.taskHistory || [];
    box.innerHTML = "";
    if(list.length === 0){
      box.innerHTML = '<div class="list-item">Henüz görev geçmişi yok.</div>';
      return;
    }
    list.slice(0,6).forEach(item=>{
      const div = document.createElement("div");
      div.className = "list-item";
      div.innerHTML = "<span><span class='plan-date-badge'></span><br><span class='plan-history-text'></span></span>";
      div.querySelector(".plan-date-badge").textContent = item.date + " • " + item.time;
      div.querySelector(".plan-history-text").textContent = item.text;
      box.appendChild(div);
    });
  }

  function renderDailyTasks(){
    const box = $("taskListMain");
    if(!box) return;
    const tasks = getTasks();
    box.innerHTML = "";
    if(tasks.length === 0){
      box.innerHTML = '<div class="daily-task"><span class="check">+</span><span>Henüz görev eklenmedi.</span></div>';
    }else{
      tasks.forEach((task,index)=>{
        const item = document.createElement("div");
        item.className = "daily-task " + (task.done ? "done" : "");
        item.innerHTML = '<div class="daily-task-main"><span class="check">'+(task.done ? "✓" : "")+'</span><span></span></div><button class="daily-task-delete">Sil</button>';
        item.querySelector(".daily-task-main span:last-child").textContent = task.text;
        item.querySelector(".daily-task-main").onclick = () => toggleDailyTask(index);
        item.querySelector(".daily-task-delete").onclick = (e) => { e.stopPropagation(); deleteDailyTask(index); };
        box.appendChild(item);
      });
    }
    const ts = taskStats();
    if($("planProgressFill")) $("planProgressFill").style.width = ts.pct + "%";
    if($("planProgressText")) $("planProgressText").textContent = "Görev ilerlemesi: %" + ts.pct + " (" + ts.done + "/" + ts.total + ")";
  }

  function renderNotes(){
    const box=$("noteList"); box.innerHTML="";
    data.notes = (data.notes || []).filter(n => (typeof n === "string" ? n.trim() : (n.text || "").trim()));
    if(data.notes.length===0){ box.innerHTML='<div class="list-item">Henüz not yok.</div>'; return; }
    data.notes.forEach((n,i)=>{
      const noteText = typeof n === "string" ? n : n.text;
      const noteDate = typeof n === "string" ? "" : (n.date + " • " + n.time);
      const div=document.createElement("div");
      div.className="list-item";
      div.innerHTML="<span><span class='note-text'></span><span class='note-date'></span></span><button>Sil</button>";
      div.querySelector(".note-text").textContent=noteText;
      div.querySelector(".note-date").textContent=noteDate;
      div.querySelector("button").onclick=async()=>{data.notes.splice(i,1);await saveCloud();render();};
      box.appendChild(div);
    });
  }

  );