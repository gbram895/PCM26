// Boot
(function () {
  function boot() { PCM.UI.init(document.getElementById('root')); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
