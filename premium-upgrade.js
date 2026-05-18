/* SezR Matematik - Tüm Sayfalar Premium JS */
(function(){
  const symbols=["∫","π","√","Σ","Δ","f(x)","lim","x²","dy/dx","∞","%","log"];
  const colors=["gold","blue","green",""];
  if(!document.querySelector(".sezr-particles")){
    const layer=document.createElement("div");
    layer.className="sezr-particles";
    document.body.prepend(layer);
    for(let i=0;i<30;i++){
      const s=document.createElement("span");
      s.className="sezr-particle "+colors[i%colors.length];
      s.textContent=symbols[i%symbols.length];
      s.style.left=Math.random()*100+"%";
      s.style.top=Math.random()*100+"%";
      s.style.fontSize=(22+Math.random()*58)+"px";
      s.style.setProperty("--dur",(10+Math.random()*16)+"s");
      s.style.setProperty("--x",(-45+Math.random()*90)+"px");
      s.style.setProperty("--y",(-60+Math.random()*90)+"px");
      s.style.setProperty("--r",(-20+Math.random()*40)+"deg");
      layer.appendChild(s);
    }
  }
  if(!document.querySelector(".sezr-mouse-glow")){
    const glow=document.createElement("div");
    glow.className="sezr-mouse-glow";
    document.body.appendChild(glow);
    let visible=false;
    window.addEventListener("mousemove",function(e){
      glow.style.left=e.clientX+"px";
      glow.style.top=e.clientY+"px";
      if(!visible){visible=true;glow.style.opacity="1";}
    });
    document.addEventListener("mouseleave",function(){visible=false;glow.style.opacity="0";});
  }
  const revealTargets=document.querySelectorAll(".page-hero,.hero,.card,.video-card,.section-title,.footer,.focus-stage-card,.focus-control-studio,.focus-option-card,.focus-youtube-card,.focus-mode-card,.premium-mini");
  revealTargets.forEach(el=>el.classList.add("sezr-reveal"));
  const io=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting)entry.target.classList.add("sezr-visible");});},{threshold:.12});
  revealTargets.forEach(el=>io.observe(el));
  if(!document.querySelector(".sezr-wa-float")){
    const wa=document.createElement("a");
    wa.className="sezr-wa-float";
    wa.href="https://wa.me/905058266949?text=Merhaba%20SezR%20Matematik%20dersleri%20hakk%C4%B1nda%20bilgi%20almak%20istiyorum";
    wa.innerHTML="<span>🟢</span><b>WhatsApp</b>";
    document.body.appendChild(wa);
  }
})();
