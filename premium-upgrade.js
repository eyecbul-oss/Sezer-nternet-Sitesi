/* =========================================================
   SezR Matematik - Premium Upgrade JS
   Mevcut app.js'i silmeden EK DOSYA olarak kullan.
   Dosya adı: premium-upgrade.js
   ========================================================= */

(function(){
  const symbols=["∫","π","√","Σ","Δ","f(x)","lim","x²","dy/dx","∞","%","log"];
  const colors=["gold","blue","green",""];
  const layer=document.createElement("div");
  layer.className="sezr-particles";
  document.body.prepend(layer);

  for(let i=0;i<26;i++){
    const s=document.createElement("span");
    s.className="sezr-particle "+colors[i%colors.length];
    s.textContent=symbols[i%symbols.length];
    s.style.left=Math.random()*100+"%";
    s.style.top=Math.random()*100+"%";
    s.style.fontSize=(18+Math.random()*42)+"px";
    s.style.setProperty("--dur",(10+Math.random()*14)+"s");
    s.style.setProperty("--x",(-35+Math.random()*70)+"px");
    s.style.setProperty("--y",(-50+Math.random()*80)+"px");
    s.style.setProperty("--r",(-18+Math.random()*36)+"deg");
    layer.appendChild(s);
  }

  const glow=document.createElement("div");
  glow.className="sezr-mouse-glow";
  document.body.appendChild(glow);

  let glowVisible=false;
  window.addEventListener("mousemove",function(e){
    glow.style.left=e.clientX+"px";
    glow.style.top=e.clientY+"px";
    if(!glowVisible){
      glowVisible=true;
      glow.style.opacity="1";
    }
  });

  document.addEventListener("mouseleave",function(){
    glowVisible=false;
    glow.style.opacity="0";
  });

  const revealTargets=document.querySelectorAll(
    ".hero,.card,.section-title,.footer,.focus-video-stage,.focus-control-card,.focus-input-card,.focus-library-card,.video-card,.focus-player-card,.focus-side-panel"
  );

  revealTargets.forEach(function(el){
    el.classList.add("sezr-reveal");
  });

  const io=new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if(entry.isIntersecting){
        entry.target.classList.add("sezr-visible");
      }
    });
  },{threshold:.12});

  revealTargets.forEach(function(el){io.observe(el);});

  if(!document.querySelector(".sezr-wa-float")){
    const wa=document.createElement("a");
    wa.className="sezr-wa-float";
    wa.href="https://wa.me/905058266949?text=Merhaba%20SezR%20Matematik%20dersleri%20hakk%C4%B1nda%20bilgi%20almak%20istiyorum";
    wa.innerHTML="<span>🟢</span><b>WhatsApp</b>";
    document.body.appendChild(wa);
  }

  document.querySelectorAll(".card,.video-card,.focus-video-stage,.focus-control-card,.focus-input-card,.focus-library-card").forEach(function(card){
    card.addEventListener("mousemove",function(e){
      const r=card.getBoundingClientRect();
      const x=e.clientX-r.left;
      const y=e.clientY-r.top;
      const rx=((y/r.height)-.5)*-4;
      const ry=((x/r.width)-.5)*4;
      card.style.transform="perspective(900px) rotateX("+rx+"deg) rotateY("+ry+"deg) translateY(-5px)";
    });
    card.addEventListener("mouseleave",function(){
      card.style.transform="";
    });
  });
})();
