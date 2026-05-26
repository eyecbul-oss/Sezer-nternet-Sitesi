window.SEZR_FOCUS_CONFIG = {
  firebaseEnabled: true,
  firebase: {
    apiKey: "AIzaSyCWH-I-qn8-prKwAY_BUDA-Pt3IsY50JLs",
    authDomain: "sezrmatematik-f7c5b.firebaseapp.com",
    projectId: "sezrmatematik-f7c5b",
    storageBucket: "sezrmatematik-f7c5b.firebasestorage.app",
    messagingSenderId: "600885583173",
    appId: "1:600885583173:web:ac2ee7ee9b963c0237322c",
    measurementId: "G-QGKXPLW7TS"
  }
};

(function(){
  function addCss(file){
    var link=document.createElement('link');
    link.rel='stylesheet';
    link.href=file+'?v=focus-premium-1';
    document.head.appendChild(link);
  }
  function addJs(file){
    var script=document.createElement('script');
    script.src=file+'?v=focus-premium-1';
    script.defer=true;
    document.body.appendChild(script);
  }
  addCss('focus-premium-upgrade.css');
  window.addEventListener('DOMContentLoaded',function(){
    [
      'focus-premium-upgrade.js',
      'focus-analytics-system.js',
      'focus-achievement-system.js',
      'focus-immersive-mode.js',
      'focus-profile-system.js',
      'focus-smart-start.js',
      'focus-habit-system.js',
      'focus-smart-planner.js',
      'focus-sound-modes.js',
      'focus-insights-system.js'
    ].forEach(addJs);
  });
})();
