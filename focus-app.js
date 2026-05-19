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

  function blank(){ return {name:"",email:"",plan:"",notes:[],sessions:[],totalSeconds:0,totalPomodoros:0,days:{}}; }
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
      const snap = await userDoc().get();
      if(snap.exists){
        data = Object.assign(blank(), snap.data());
        saveLocal();
      }else{
        data.email = user.email || "";
        data.name = user.displayName || "";
        await saveCloud();
      }
    }
    render();
  }

  async function saveCloud(){
    saveLocal();
    if(user && db){
      await userDoc().set(data, {merge:true});
    }
  }

  async function signIn(){
    const email = $("authEmail").value.trim().toLowerCase();
    const pass = $("authPassword").value;
    if(!email || !pass){ showMessage("Mail ve şifre gir."); return; }
    try{
      showMessage("Giriş yapılıyor...");
      await auth.signInWithEmailAndPassword(email, pass);
    }catch(e){
      showMessage(errorText(e));
    }
  }

  async function register(){
    const email = $("authEmail").value.trim().toLowerCase();
    const pass = $("authPassword").value;
    const name = $("authName").value.trim();
    if(!email || !pass || pass.length < 6){ showMessage("Mail gir ve en az 6 karakter şifre yaz."); return; }
    try{
      showMessage("Hesap oluşturuluyor...");
      const result = await auth.createUserWithEmailAndPassword(email, pass);
      if(name) await result.user.updateProfile({displayName:name});
      data = blank();
      data.email = email;
      data.name = name;
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
    $("authName").classList.toggle("hidden", mode==="login");
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
    timerId=setInterval(async ()=>{
      if(remaining>0){
        remaining--;
        if(!isBreak){ day().seconds++; data.totalSeconds++; await saveCloud(); }
        render();
      }else finish();
    },1000);
    render();
  }

  function pause(){
    if(!running) return;
    clearInterval(timerId);
    running=false;
    if(!isBreak){ day().pauses++; saveCloud(); }
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
    await saveCloud();

    if($("autoBreak").checked) startBreak(5);
    else { pauseAudio(); $("successModal").classList.add("show"); $("timerStatus").textContent="Tamamlandı"; render(); }
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
    if(!data.plan && min===0) return "Önce çalışma planını yaz, sonra 25 dakikalık seansla başla.";
    if(data.plan && min===0) return "Plan hazır. Şimdi 25 dakika sadece bu plana odaklan.";
    if(min<60) return "Başlangıç yapıldı. 60 dakikaya yaklaşmak için bir seans daha ekleyebilirsin.";
    return "Günlük hedef tamamlandı. Şimdi tekrar veya yanlış analizi daha verimli olur.";
  }

  function render(){
    const d=day(), min=Math.floor(d.seconds/60), pct=Math.min(100,Math.round(min/60*100));
    $("timerText").textContent=fmt(remaining);
    $("timerRing").style.setProperty("--progress", ((totalSeconds-remaining)/totalSeconds*360)+"deg");
    $("mainToggleBtn").textContent = running ? "Duraklat" : (remaining<totalSeconds ? "Devam Et" : "Başlat");
    $("mainToggleBtn").classList.toggle("running", running);
    $("savedPlan").textContent = data.plan || "Henüz plan yazılmadı.";
    $("planInput").value = data.plan || "";
    $("aiAdvice").textContent = advice();
    $("todayMinutes").textContent = min+" dk";
    $("todayPomodoros").textContent = d.pomodoros;
    $("focusScore").textContent = score()+"%";
    $("streakDays").textContent = streak();
    $("progressFill").style.width = pct+"%";
    $("progressText").textContent = min+" / 60 dk • %"+pct;
    $("accountEmail").textContent = user ? user.email : "";
    $("profileNameInput").value = data.name || "";
    renderNotes();
    renderSessions();
  }

  function renderNotes(){
    const box=$("noteList"); box.innerHTML="";
    if(data.notes.length===0){ box.innerHTML='<div class="list-item">Henüz not yok.</div>'; return; }
    data.notes.forEach((n,i)=>{
      const div=document.createElement("div");
      div.className="list-item";
      div.innerHTML="<span></span><button>Sil</button>";
      div.querySelector("span").textContent=n;
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

  async function savePlan(){ data.plan=$("planInput").value.trim(); await saveCloud(); render(); }
  async function addNote(){ const v=$("noteInput").value.trim(); if(!v)return; data.notes.push(v); $("noteInput").value=""; await saveCloud(); render(); }
  async function saveProfile(){ data.name=$("profileNameInput").value.trim(); await saveCloud(); render(); $("settingsPanel").classList.remove("show"); }
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
  $("addNoteBtn").onclick=addNote;
  $("volumeRange").oninput=e=>{ $("focusAudio").volume=e.target.value/100; $("volumeText").textContent="🔊 "+e.target.value+"%"; };
  $("settingsBtn").onclick=()=>$("settingsPanel").classList.toggle("show");
  $("closeSettingsBtn").onclick=()=>$("settingsPanel").classList.remove("show");
  $("saveProfileBtn").onclick=saveProfile;
  $("logoutBtn").onclick=()=>auth.signOut();
  $("exportBtn").onclick=exportData;
  $("importBtn").onclick=importData;
  $("resetDataBtn").onclick=resetData;
  $("closeModalBtn").onclick=()=>{ $("successModal").classList.remove("show"); reset(); };
  document.querySelectorAll(".mode").forEach(btn=>btn.onclick=()=>{ document.querySelectorAll(".mode").forEach(b=>b.classList.remove("active")); btn.classList.add("active"); focusSeconds=Number(btn.dataset.min)*60; totalSeconds=focusSeconds; remaining=totalSeconds; reset(); });
  document.querySelectorAll(".break-btn").forEach(btn=>btn.onclick=()=>startBreak(Number(btn.dataset.break)));
  document.querySelectorAll(".track").forEach(btn=>btn.onclick=()=>{ const was=isAudioPlaying; pauseAudio(); setTrack(btn.dataset.track); if(was) playAudio(); });
  document.addEventListener("keydown",e=>{ const tag=(e.target.tagName||"").toLowerCase(); if(tag==="input"||tag==="textarea")return; if(e.code==="Space"){e.preventDefault();toggle();} });

  if(auth){
    auth.onAuthStateChanged(async current=>{
      user=current;
      if(user){
        showApp();
        await loadCloud();
      }else{
        showAuth();
      }
    });
  }else{
    showMessage("Firebase yüklenemedi. İnternet bağlantısını veya config dosyasını kontrol et.");
  }

  ambience();
  setTrack("rain");
  document.querySelector(".music-panel").classList.add("paused");
});