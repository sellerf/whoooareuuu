(function () {
  var aliases = {
    inicio: 'inicio',
    home: 'inicio',
    manifesto: 'inicio',
    membros: 'membros',
    pessoas: 'membros',
    ferramentas: 'ferramentas',
    tools: 'ferramentas'
  };

  function resolve(name) {
    var key = String(name || 'inicio').toLowerCase().replace(/^#/, '');
    return aliases[key] || 'inicio';
  }

  function go(name) {
    var target = resolve(name);
    var views = document.querySelectorAll('.view');
    var tabs = document.querySelectorAll('[data-view]');
    var i;

    for (i = 0; i < views.length; i++) {
      views[i].classList.toggle('active', views[i].id === target);
    }

    for (i = 0; i < tabs.length; i++) {
      var on = tabs[i].getAttribute('data-view') === target;
      tabs[i].classList.toggle('is-active', on);
      tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }

    var next = document.getElementById(target);
    if (next) {
      var area = next.querySelector('.scroll-area');
      if (area) area.scrollTop = 0;
    }

    if (location.hash !== '#' + target) {
      history.replaceState(null, '', '#' + target);
    }
  }

  function onNavClick(event) {
    var el = event.target.closest('[data-view], [data-go]');
    if (!el) return;
    var name = el.getAttribute('data-view') || el.getAttribute('data-go');
    if (!name) return;
    event.preventDefault();
    event.stopPropagation();
    go(name);
  }

  document.addEventListener('click', onNavClick, true);

  window.addEventListener('hashchange', function () {
    go(location.hash || 'inicio');
  });

  go(location.hash || 'inicio');

  var unlockAt = new Date(2026, 9, 25, 0, 0, 0, 0);
  var varch = document.getElementById('tool-varch');
  var varchLink = document.getElementById('varch-link');
  var varchGo = document.getElementById('varch-go');
  if (varch && varchLink && varchGo) {
    if (Date.now() >= unlockAt.getTime()) {
      varchLink.textContent = '/varch';
      varchGo.textContent = '↗';
      varch.classList.remove('is-locked');
    } else {
      varch.classList.add('is-locked');
      varchLink.classList.add('is-soon');
      varch.addEventListener('click', function (e) {
        e.preventDefault();
      });
    }
  }
})();
