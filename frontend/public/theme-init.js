(function () {
  try {
    var d = document.documentElement;
    var theme = localStorage.getItem('mp-theme');
    if (theme !== 'light' && theme !== 'dark') {
      theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    d.setAttribute('data-theme', theme);
    var lang = localStorage.getItem('mp-lang');
    if (lang !== 'en' && lang !== 'fr') {
      lang = (navigator.language || 'en').slice(0, 2) === 'fr' ? 'fr' : 'en';
    }
    d.setAttribute('lang', lang);
  } catch (e) { /* storage blocked: keep defaults */ }
})();
