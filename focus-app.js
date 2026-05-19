document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const cfg = window.SEZR_FOCUS_CONFIG || {};
  const firebaseReady = !!(cfg.firebaseEnabled && window.firebase && cfg.firebase && cfg.firebase.apiKey);

  let app = null, auth = null, db = null, user = null;
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
  let saveTimer = null;
  let saveBusy = false;

  function blank(){ return {name:"",email:"",plan:"",selectedSubject:"",dailyTarget:60,exam:{group:"YKS",type:"TYT",date:"2026-06-20",hidden:false},notes:[],sessions:[],planHistory:[],totalSeconds:0,totalPomodoros:0,days:{}}; }
  function localKey(){ return user ? "sezr_focus_cloud_" + user.uid : "sezr_focus_guest"; }
  function saveLocal(){ localStorage.setItem(localKey(), JSON.stringify(data)); }
  function loadLocal(){ try{return Object.assign(blank(), JSON.parse(localStorage.getItem(localKey()) || "{}"));}catch{return blank();} }
  function userDoc(){ return db.collection("focusUsers").doc(user.uid); }
  function today(){ return new Date().toISOString().slice(0,10); }
  function day(){ const k=today(); if(!data.days[k]) data.days[k]={seconds:0,pomodoros:0,pauses:0}; return data.days[k]; }
  function fmt(sec){ const m=Math.floor(sec/60), s=sec%60; return String(m).padStart(2,"0")+":"+String(s).padStart(2,"0"); }
  function paths(track){ const f=tracks[track].file; return ["music/"+f,f,"./music/"+f,"./"+f]; }
  function showMessage(msg){ $("authMessage").textContent = msg || ""; }

  async function loadCloud(){
    data = loadLocal();
    if(user && db){
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
    if(!email || !pass){ showMessage("Mail ve şifre gir."); return; }
    if(!auth){ showMessage("Firebase bağlantısı hazır değil."); return; }

    try{
      showMessage("Giriş yapılıyor...");
      $("authSubmit").disabled = true;

      await Promise.race([
        auth.signInWithEmailAndPassword(email, pass),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 10000))
      ]);

      showMessage("");
    }catch(e){
      if(e.message === "timeout"){
        showMessage("Giriş uzun sürdü. Email/Password açık mı ve site internetten güncel yüklendi mi kontrol et.");
      }else{
        showMessage(errorText(e));
      }
    }finally{
      $("authSubmit").disabled = false;
    }
  }

  async function register(){
    const email = $("authEmail").value.trim().toLowerCase();
    const pass = $("authPassword").value;
    if(!email || !pass || pass.length < 6){ showMessage("Mail gir ve en az 6 karakter şifre yaz."); return; }
    try{
      showMessage("Hesap oluşturuluyor...");
      const result = await auth.createUserWithEmailAndPassword(email, pass);

      data = blank();
      data.email = email;
      data.name = "";
      user = result.user;
      await saveCloud();
    }catch(e){
      showMessage(errorText(e));
    }
  }

  async function forgot(){
    const email = $("authEmail").value.trim().toLowerCase();
    if(!email){ showMessage("Şifre sıfırlamak için mail adresini yaz."); return; }
    try{
      await auth.sendPasswordResetEmail(email);
      showMessage("Şifre sıfırlama maili gönderildi.");
    }catch(e){ showMessage(errorText(e)); }
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
    totalSeconds=focusSeconds;
    remaining=totalSeconds;
    pauseAudio();
    $("timerStatus").textContent="Hazır";
    render();
  }

  function startBreak(min){
    clearInterval(timerId);
    running=false;
    isBreak=true;
    totalSeconds=min*60;
    remaining=totalSeconds;
    $("timerStatus").textContent="Mola";
    forceStopAudio();
    render();
    start();
  }

  async function finish(){
    clearInterval(timerId);
    running=false;

    if(isBreak){
      isBreak=false;
      totalSeconds=focusSeconds;
      remaining=totalSeconds;
      $("timerStatus").textContent="Mola bitti";
      forceStopAudio();
      playAlarm();
      render();
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

  function advice(){
    const d=day(), min=Math.floor(d.seconds/60);
    if(day().planDone) return "Bugünkü plan tamamlandı. İstersen kısa tekrar veya yanlış analiziyle günü kapat.";
    if(!data.plan && min===0) return "Önce çalışma planını yaz, sonra 25 dakikalık seansla başla.";
    if(data.plan && min===0) return "Plan hazır. Şimdi 25 dakika sadece bu plana odaklan.";
    if(min < Number(data.dailyTarget || 60)) return "Başlangıç yapıldı. Günlük hedefe yaklaşmak için bir seans daha ekleyebilirsin.";
    return "Günlük hedef tamamlandı. Şimdi tekrar veya yanlış analizi daha verimli olur.";
  }



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
      $("examAdvice").textContent = "Seçilen tarih geçmiş görünüyor. Yeni tarih seçebilirsin.";
      return;
    }

    const totalMinutes = Math.floor(diff / 60000);
    const days = Math.floor(totalMinutes / (60*24));
    const hours = Math.floor((totalMinutes % (60*24)) / 60);
    const minutes = totalMinutes % 60;

    $("examDays").textContent = days;
    $("examHours").textContent = hours;
    $("examMinutes").textContent = minutes;

    let advice = "Bugün küçük ama net bir çalışma planı seç.";
    if(days > 120) advice = "Zaman var. Konu eksiklerini kapatmaya odaklan.";
    else if(days > 60) advice = "Deneme + konu tekrarı dengesini kur.";
    else if(days > 30) advice = "Yanlış analizi ve süre yönetimine ağırlık ver.";
    else if(days > 7) advice = "Yeni konu azalt, tekrar ve deneme analizini artır.";
    else advice = "Son hafta: hafif tekrar, uyku düzeni ve moral önemli.";

    $("examAdvice").textContent = advice;
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
      item.className = "week-day";
      item.innerHTML = '<div class="week-bar" style="height:'+h+'px"></div><b>'+min+' dk</b><span>'+x.label+'</span>';
      box.appendChild(item);
    });
    if(totalEl) totalEl.textContent = total + " dk";
  }


  async function changeDailyTarget(){
    data.dailyTarget = Number($("dailyTargetSelect").value || 60);
    await saveCloud();
    render();
  }

  async function togglePlanDone(){
    const d = day();
    d.planDone = !d.planDone;
    await saveCloud();
    render();
  }

  function render(){
    const d=day();
    const min=Math.floor(d.seconds/60);
    const target = Number(data.dailyTarget || 60);
    const pct=Math.min(100,Math.round(min/target*100));
    $("timerText").textContent=fmt(remaining);
    $("timerRing").style.setProperty("--progress", ((totalSeconds-remaining)/totalSeconds*360)+"deg");
    $("mainToggleBtn").textContent = running ? "Duraklat" : (remaining<totalSeconds ? "Devam Et" : "Başlat");
    $("mainToggleBtn").classList.toggle("running", running);
    $("savedPlan").textContent = data.plan || "Henüz plan yazılmadı.";
    if($("completePlanBtn")){
      $("completePlanBtn").classList.toggle("done", !!day().planDone);
      $("completePlanBtn").textContent = day().planDone ? "Plan tamamlandı ✓" : "Bugünkü plan tamamlandı";
    }
    const active = document.activeElement;
    const typing =
      active &&
      (active.tagName === "INPUT" || active.tagName === "TEXTAREA");

    if(!typing && $("planInput")){
      $("planInput").value = data.plan || "";
    }
    $("aiAdvice").textContent = advice();
    $("todayMinutes").textContent = min+" dk";
    $("todayPomodoros").textContent = d.pomodoros;
    $("focusScore").textContent = score()+"%";
    $("streakDays").textContent = streak();
    $("progressFill").style.width = pct+"%";
    $("progressText").textContent = min+" / "+target+" dk • %"+pct;
    if($("dailyTargetSelect")) $("dailyTargetSelect").value = String(target);
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
    $("accountEmail").textContent = user ? user.email : "";
renderNotes();
    renderSessions();
  }


  function buildTodaySummary(){
    const d = day();
    const min = Math.floor((d.seconds || 0) / 60);
    const plan = data.plan ? data.plan : "Plan yazılmadı";
    const done = d.planDone ? "tamamlandı" : "devam ediyor";
    const subject = data.selectedSubject ? " • Konu: " + data.selectedSubject : "";
    return "Plan: " + plan + subject + " • Durum: " + done + " • Süre: " + min + " dk • Pomodoro: " + (d.pomodoros || 0);
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

  function renderPlanHistory(){
    const box = $("planHistoryList");
    if(!box) return;
    const list = data.planHistory || [];
    box.innerHTML = "";
    if(list.length === 0){
      box.innerHTML = '<div class="list-item">Henüz plan geçmişi yok.</div>';
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

  function renderNotes(){
    const box=$("noteList"); box.innerHTML="";
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

  function renderSessions(){
    const box=$("sessionList"); box.innerHTML="";
    if(data.sessions.length===0){ box.innerHTML='<div class="list-item">Henüz seans yok.</div>'; return; }
    data.sessions.slice(0,5).forEach(s=>{
      const div=document.createElement("div");
      div.className="list-item";
      div.textContent=s;
      box.appendChild(div);
    });
  }

  async function clearPlan(){
    if(!data.plan && !$("planInput").value.trim()) return;
    if(!confirm("Bugünkü plan temizlensin mi?")) return;
    data.plan = "";
    day().planDone = false;
    $("planInput").value = "";
    await saveCloud();
    render();
  }

  async function applySubject(subject){
    data.selectedSubject = subject;
    const current = $("planInput").value.trim();
    if(!current){
      $("planInput").value = subject + " çalışması";
    }else if(!current.toLowerCase().includes(subject.toLowerCase())){
      $("planInput").value = subject + " • " + current;
    }
    await savePlan();
  }

  function renderNextSuggestion(){
    const el = $("nextSuggestion");
    if(!el) return;
    const d = day();
    const min = Math.floor((d.seconds || 0) / 60);
    let text = "Sonraki adım: İlk seansı başlat.";
    if(data.plan && min === 0) text = "Sonraki adım: Bu plana 25 dakika odaklan.";
    if(min > 0 && min < Number(data.dailyTarget || 60)) text = "Sonraki adım: Bir seans daha ekle veya 10 soru çöz.";
    if(d.planDone) text = "Sonraki adım: Yanlış analizi veya kısa tekrar yap.";
    if(min >= Number(data.dailyTarget || 60)) text = "Sonraki adım: Yeni konuya geçmeden önce günü özetle.";
    el.textContent = text;
  }

  async function savePlan(){ 
    const newPlan = $("planInput").value.trim();
    if(newPlan && newPlan !== data.plan){
      data.planHistory = data.planHistory || [];
      data.planHistory.unshift({
        text:newPlan,
        date:new Date().toLocaleDateString("tr-TR"),
        time:new Date().toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"})
      });
      data.planHistory = data.planHistory.slice(0,8);
    }
    data.plan = newPlan; 
    day().planDone = false;
    await saveCloud(); 
    render(); 
  }
  async function addNote(){ 
    const v=$("noteInput").value.trim(); 
    if(!v)return; 
    data.notes.push({text:v,date:new Date().toLocaleDateString("tr-TR"),time:new Date().toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"})}); 
    $("noteInput").value=""; 
    await saveCloud(); 
    render(); 
  }
function exportData(){ const raw=JSON.stringify(data); navigator.clipboard?navigator.clipboard.writeText(raw).then(()=>alert("Yedek kodu kopyalandı.")):prompt("Yedek kodu:",raw); }
  async function importData(){ const raw=prompt("Yedek kodunu yapıştır:"); if(!raw)return; try{data=Object.assign(blank(),JSON.parse(raw)); await saveCloud(); render(); alert("Yedek yüklendi.");}catch{alert("Yedek okunamadı.");} }
  async function resetData(){ if(!confirm("Bu hesabın verileri silinsin mi?"))return; data=blank(); data.email=user.email; await saveCloud(); reset(); render(); }

  function ambience(){
    const rain=$("rainLayer");
    for(let i=0;i<90;i++){ const d=document.createElement("div"); d.className="drop"; d.style.left=Math.random()*100+"%"; d.style.animationDuration=(.6+Math.random()*.7)+"s"; d.style.animationDelay=Math.random()*2+"s"; rain.appendChild(d); }
    const syms=["∫","π","√","Σ","Δ","f(x)","lim","x²","∞"], layer=$("symbolLayer");
    for(let i=0;i<28;i++){ const s=document.createElement("span"); s.className="sym"; s.textContent=syms[i%syms.length]; s.style.left=Math.random()*100+"%"; s.style.top=Math.random()*100+"%"; s.style.fontSize=(24+Math.random()*58)+"px"; s.style.animationDuration=(10+Math.random()*15)+"s"; layer.appendChild(s); }
  }

  $("loginTab").onclick=()=>setAuthMode("login");
  $("registerTab").onclick=()=>setAuthMode("register");
  $("authSubmit").onclick=()=> mode==="login" ? signIn() : register();
  $("forgotBtn").onclick=forgot;
  $("mainToggleBtn").onclick=toggle;
  $("resetBtn").onclick=reset;
  $("savePlanBtn").onclick=savePlan;
  $("completePlanBtn").onclick=togglePlanDone;
  if($("clearPlanBtn")) $("clearPlanBtn").onclick=clearPlan;
  if($("dailyTargetSelect")) $("dailyTargetSelect").onchange=changeDailyTarget;
  if($("examGroupSelect")) $("examGroupSelect").onchange=changeExamGroup;
  if($("examTypeSelect")) $("examTypeSelect").onchange=changeExamType;
  if($("saveExamBtn")) $("saveExamBtn").onclick=saveExamSettings;
  if($("toggleExamBtn")) $("toggleExamBtn").onclick=toggleExamPanel;
  document.querySelectorAll(".subject-tag").forEach(btn=>{
    btn.onclick=()=>applySubject(btn.dataset.subject);
  });
  $("addNoteBtn").onclick=addNote;
  if($("copySummaryBtn")) $("copySummaryBtn").onclick=copyTodaySummary;
  $("volumeRange").oninput=e=>{ $("focusAudio").volume=e.target.value/100; $("volumeText").textContent="🔊 "+e.target.value+"%"; };
  $("settingsBtn").onclick=()=>$("settingsPanel").classList.toggle("show");
  $("closeSettingsBtn").onclick=()=>$("settingsPanel").classList.remove("show");
  $("logoutBtn").onclick=()=>auth.signOut();
  $("closeModalBtn").onclick=()=>{ $("successModal").classList.remove("show"); reset(); };
  document.querySelectorAll(".mode").forEach(btn=>btn.onclick=()=>{ document.querySelectorAll(".mode").forEach(b=>b.classList.remove("active")); btn.classList.add("active"); focusSeconds=Number(btn.dataset.min)*60; totalSeconds=focusSeconds; remaining=totalSeconds; reset(); });
  document.querySelectorAll(".break-btn").forEach(btn=>btn.onclick=()=>startBreak(Number(btn.dataset.break)));
  document.querySelectorAll(".track").forEach(btn=>btn.onclick=()=>{ const was=isAudioPlaying; pauseAudio(); setTrack(btn.dataset.track); if(was) playAudio(); });
  document.addEventListener("keydown",e=>{ const tag=(e.target.tagName||"").toLowerCase(); if(tag==="input"||tag==="textarea")return; if(e.code==="Space"){e.preventDefault();toggle();} });

  document.addEventListener("click", (e) => {
    const panel = $("settingsPanel");
    const btn = $("settingsBtn");
    if(!panel || !btn) return;
    const isOpen = panel.classList.contains("show");
    if(!isOpen) return;
    const clickedInsidePanel = panel.contains(e.target);
    const clickedSettingsBtn = btn.contains(e.target);
    if(!clickedInsidePanel && !clickedSettingsBtn){
      panel.classList.remove("show");
    }
  });


  window.addEventListener("beforeunload", () => {
    saveLocal();
  });

  if(auth){
    auth.onAuthStateChanged(async current=>{
      user=current;
      if(user){
        showApp();
        try{
          await loadCloud();
        }catch(e){
          console.warn("Cloud load failed:", e);
          data = loadLocal();
          data.email = user.email || "";
          render();
        }
      }else{
        showAuth();
      }
    });
  }else{
    showMessage("Firebase yüklenemedi. İnternet bağlantısını veya config dosyasını kontrol et.");
  }

  setInterval(()=>{ 
    if($("examCountdownPanel")) renderExamCountdown(); 
  }, 60000);

  ambience();
  setTrack("rain");
  document.querySelector(".music-panel").classList.add("paused");
});