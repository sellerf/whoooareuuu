(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const windows = {
    discord: $('#discordWindow'),
    linarc: $('#linarcWindow'),
    image: $('#imageWindow'),
    terminal: $('#terminalWindow'),
  };
  const running = $('#runningApps');
  const toast = $('#toast');
  let zIndex = 8;
  let toastTimer;
  let invalidCount = 0;
  let secretClicks = 0;
  let currentLanguage = 'en';

  const translations = {
    en: {
      welcome: 'YOU HAVE BEEN EXPECTED', start: 'hello', terminalWelcome: 'hello system [build 18.12.1878]', terminalHint: 'one command remains.',
      discordTitle: 'disccccord / invitation', external: 'EXTERNAL GATEWAY', discordHeadline: 'the door is still open.',
      discordBody: 'You were not supposed to find this place.', discordButton: 'ENTER DISCCCCORD', discordFoot: 'destination verified — discord.gg/pentesting',
      linarcTitle: 'lnrrrrrc / node 01', linarcNetwork: 'LINARC NETWORK', linarcHeadline: 'follow the bando.',
      linarcBody: 'Somewhere, the signal remembers you.', linarcButton: 'OPEN NODE', linarcFoot: 'route: linarcteam.site',
      invalid: 'invalid command', whisper: '...it heard you.',
    },
    pt: {
      welcome: 'ESTAVAM ESPERANDO POR VOCÊ', start: 'hello', terminalWelcome: 'sistema hello [versão 18.12.1878]', terminalHint: 'resta um comando.',
      discordTitle: 'disccccord / convite', external: 'PORTAL EXTERNO', discordHeadline: 'a porta ainda está aberta.',
      discordBody: 'Você não deveria ter encontrado este lugar.', discordButton: 'ENTRAR NO DISCCCCORD', discordFoot: 'destino verificado — discord.gg/pentesting',
      linarcTitle: 'lnrrrrrc / nó 01', linarcNetwork: 'REDE LINARC', linarcHeadline: 'siga o bando.',
      linarcBody: 'Em algum lugar, o sinal se lembra de você.', linarcButton: 'ABRIR NÓ', linarcFoot: 'rota: linarcteam.site',
      invalid: 'comando inválido', whisper: '...ele ouviu você.',
    },
  };

  const setLanguage = (language) => {
    currentLanguage = language;
    document.documentElement.lang = language === 'pt' ? 'pt-BR' : 'en';
    document.querySelectorAll('[data-i18n]').forEach((node) => {
      const translated = translations[language][node.dataset.i18n];
      if (translated) node.textContent = translated;
    });
  };

  const showToast = (message) => {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2900);
  };

  const focusWindow = (win) => {
    win.style.zIndex = String(++zIndex);
  };

  const openWindow = (name) => {
    const win = windows[name];
    if (!win) return;
    win.hidden = false;
    focusWindow(win);
    const key = `task-${name}`;
    if (!document.getElementById(key)) {
      const button = document.createElement('button');
      button.className = 'running-app';
      button.id = key;
      button.textContent = name === 'terminal' ? 'terminal' : name === 'image' ? 'sigaobando.jpg' : name === 'discord' ? 'disccccord' : 'lnrrrrrc';
      button.addEventListener('click', () => {
        if (win.hidden) win.hidden = false;
        focusWindow(win);
      });
      running.append(button);
    }
    if (name === 'terminal') $('#terminalInput').focus();
  };

  const closeWindow = (id) => {
    const win = document.getElementById(id);
    if (!win) return;
    win.hidden = true;
    const task = document.getElementById(`task-${id.replace('Window', '').toLowerCase()}`);
    if (task) task.remove();
  };

  document.querySelectorAll('[data-open]').forEach((button) => {
    button.addEventListener('click', () => openWindow(button.dataset.open));
  });
  document.querySelectorAll('[data-close]').forEach((button) => {
    button.addEventListener('click', () => closeWindow(button.dataset.close));
  });
  document.querySelectorAll('[data-language]').forEach((button) => {
    button.addEventListener('click', () => {
      setLanguage(button.dataset.language);
      closeWindow('languageWindow');
    });
  });
  Object.values(windows).forEach((win) => win.addEventListener('pointerdown', () => focusWindow(win)));
  $('#startButton').addEventListener('click', () => openWindow('terminal'));

  $('#terminalForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = $('#terminalInput');
    const command = input.value.trim();
    if (!command) return;
    const output = $('#terminalOutput');
    const line = document.createElement('p');
    const prompt = document.createElement('span');
    prompt.className = 'green';
    prompt.textContent = `> ${command}`;
    line.append(prompt);
    output.append(line);
    const result = document.createElement('p');
    if (command.toLowerCase() === 'linarc') {
      result.className = 'green';
      result.textContent = 'Congratulations.';
      invalidCount = 0;
    } else {
      result.className = 'dim';
      result.textContent = translations[currentLanguage].invalid;
      invalidCount += 1;
    }
    output.append(result);
    if (invalidCount === 3) {
      const whisper = document.createElement('p');
      whisper.className = 'dim';
      whisper.textContent = translations[currentLanguage].whisper;
      output.append(whisper);
    }
    input.value = '';
    output.scrollTop = output.scrollHeight;
  });

  // Draggable title bars, constrained to the viewport.
  document.querySelectorAll('[data-drag]').forEach((bar) => {
    let drag = null;
    bar.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button')) return;
      const win = document.getElementById(bar.dataset.drag);
      focusWindow(win);
      const rect = win.getBoundingClientRect();
      win.style.transform = 'none';
      win.style.left = `${rect.left}px`;
      win.style.top = `${rect.top}px`;
      drag = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      bar.setPointerCapture(event.pointerId);
    });
    bar.addEventListener('pointermove', (event) => {
      if (!drag) return;
      const win = document.getElementById(bar.dataset.drag);
      const maxX = window.innerWidth - win.offsetWidth;
      const maxY = window.innerHeight - win.offsetHeight - 43;
      win.style.left = `${Math.max(0, Math.min(maxX, event.clientX - drag.x))}px`;
      win.style.top = `${Math.max(44, Math.min(maxY, event.clientY - drag.y))}px`;
    });
    const stop = () => { drag = null; };
    bar.addEventListener('pointerup', stop);
    bar.addEventListener('pointercancel', stop);
  });

  $('#crosshair').addEventListener('click', () => {
    secretClicks += 1;
    if (secretClicks === 5) {
      showToast('THE DATE IS A LIE.');
      secretClicks = 0;
    }
  });
  $('.center-word').addEventListener('click', () => showToast('you are early.'));
  let titleClicks = 0;
  $('.brand-mark').addEventListener('click', () => {
    titleClicks += 1;
    if (titleClicks === 7) {
      showToast('there is no exit in 1878.');
      titleClicks = 0;
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      Object.entries(windows).forEach(([name, win]) => {
        if (!win.hidden) closeWindow(`${name}Window`);
      });
    }
    if (event.key === 'F12' || (event.ctrlKey && event.shiftKey && ['I', 'J', 'C'].includes(event.key.toUpperCase()))) {
      showToast('nothing useful lives here.');
    }
  });
})();
