(() => {
  document.querySelectorAll('.lang button').forEach((button) => {
    button.addEventListener('click', () => {
      const lang = button.dataset.lang;
      document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';
      document.querySelectorAll('.lang button').forEach((item) => {
        item.classList.toggle('active', item === button);
      });
      document.querySelectorAll('[data-' + lang + ']').forEach((element) => {
        element.innerHTML = element.getAttribute('data-' + lang);
      });
    });
  });

  const reveals = [...document.querySelectorAll('.reveal')];

  const show = (el) => el.classList.add('visible');

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            show(entry.target);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -8% 0px' }
    );

    reveals.forEach((el) => observer.observe(el));

    // Se já estiver na viewport (ex.: âncora #sobre), mostra na hora
    requestAnimationFrame(() => {
      reveals.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) show(el);
      });
    });
  } else {
    reveals.forEach(show);
  }

  // Fallback: nunca deixar a página “vazia” por animação
  window.setTimeout(() => {
    reveals.forEach(show);
  }, 1200);

  const progressBar = document.querySelector('.scroll-progress span');
  if (progressBar) {
    let progressFrame = false;
    const updateProgress = () => {
      if (progressFrame) return;
      progressFrame = true;
      requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        progressBar.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
        progressFrame = false;
      });
    };
    updateProgress();
    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress);
  }
})();
