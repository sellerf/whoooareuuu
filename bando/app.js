function setLang(lang) {
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';
    document.querySelectorAll('[data-' + lang + ']').forEach(el => {
      el.innerHTML = el.getAttribute('data-' + lang);
    });
    document.getElementById('btn-pt').classList.toggle('active', lang === 'pt');
    document.getElementById('btn-en').classList.toggle('active', lang === 'en');
  }

  document.getElementById('btn-pt').addEventListener('click', () => setLang('pt'));
  document.getElementById('btn-en').addEventListener('click', () => setLang('en'));

  // Intro text fade
  const obs2 = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.style.opacity = '1';
        e.target.style.transform = 'translateY(0)';
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.intro-text, .manifesto-quote, .manifesto-sub').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(16px)';
    el.style.transition = 'opacity .6s, transform .6s';
    obs2.observe(el);
  });
