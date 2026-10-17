(() => {
  const aliases = {
    inicio: 'inicio',
    home: 'inicio',
    manifesto: 'inicio',
    membros: 'membros',
    pessoas: 'membros',
    ferramentas: 'ferramentas',
    tools: 'ferramentas'
  };

  const views = {
    inicio: document.getElementById('inicio'),
    membros: document.getElementById('membros'),
    ferramentas: document.getElementById('ferramentas')
  };

  const tabs = [...document.querySelectorAll('[data-view]')];

  function resolve(name) {
    const key = String(name || 'inicio').toLowerCase().replace(/^#/, '');
    return aliases[key] || 'inicio';
  }

  function go(name) {
    const target = resolve(name);
    const next = views[target];
    if (!next) return;

    Object.entries(views).forEach(([key, view]) => {
      if (!view) return;
      const on = key === target;
      view.classList.toggle('active', on);
      view.setAttribute('aria-hidden', on ? 'false' : 'true');
    });

    tabs.forEach((tab) => {
      const on = tab.getAttribute('data-view') === target;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    const area = next.querySelector('.scroll-area');
    if (area) area.scrollTop = 0;

    const hash = '#' + target;
    if (location.hash !== hash) {
      history.replaceState(null, '', hash);
    }
  }

  document.addEventListener('click', (event) => {
    const nav = event.target.closest('[data-view], [data-go]');
    if (!nav) return;
    const name = nav.getAttribute('data-view') || nav.getAttribute('data-go');
    if (!name || !aliases[resolve(name)]) return;
    event.preventDefault();
    go(name);
  });

  window.addEventListener('hashchange', () => {
    go(location.hash || 'inicio');
  });

  go(location.hash || 'inicio');

  // Varch: liberado a partir de 25/10/2026
  const unlockAt = new Date(2026, 9, 25, 0, 0, 0, 0);
  const varch = document.getElementById('tool-varch');
  const varchLink = document.getElementById('varch-link');
  const varchGo = document.getElementById('varch-go');
  if (varch && varchLink && varchGo) {
    if (Date.now() >= unlockAt.getTime()) {
      varchLink.textContent = '/varch';
      varchGo.textContent = '↗';
      varch.classList.remove('is-locked');
    } else {
      varch.classList.add('is-locked');
      varchLink.classList.add('is-soon');
      varch.addEventListener('click', (e) => e.preventDefault());
    }
  }
})();
