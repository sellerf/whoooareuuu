const services = [
  { id: 'main', name: 'Linarc Team', url: 'https://linarcteam.site/', kind: 'remote' },
  { id: 'panel', name: 'Painel', url: 'https://manddy.site/', kind: 'remote' },
  { id: 'geo', name: 'Geolocalize', url: 'https://societad.shop/geolocalize/', kind: 'remote' },
  { id: 'societad', name: 'societad.shop', url: '/', kind: 'local' }
];

const KEY = 'linarc-status-history-v1';
const INTERVAL = 30000;
const DAYS = 30;
const history = JSON.parse(localStorage.getItem(KEY) || '{}');
const dayKey = () => new Date().toISOString().slice(0, 10);

function loadHistory() {
  for (const service of services) {
    history[service.id] ??= {};
    for (let i = DAYS - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const key = date.toISOString().slice(0, 10);
      history[service.id][key] ??= 'unknown';
    }
  }
}

function save() {
  localStorage.setItem(KEY, JSON.stringify(history));
}

function render() {
  document.querySelector('#services').innerHTML = services.map(service => {
    const days = history[service.id];
    const url = service.id === 'societad'
      ? 'societad.shop'
      : service.url.replace('https://', '').replace(/\/$/, '');
    const bars = Object.entries(days).slice(-30).map(([date, state], index) => {
      const stateClass = state === 'down' ? 'out' : state === 'unknown' ? 'unknown' : '';
      return `<span class="${stateClass} ${index === 29 ? 'today' : ''}" title="${date}: ${state === 'up' ? 'Ativo' : state === 'down' ? 'Inativo' : 'Sem dados'}"></span>`;
    }).join('');

    return `<article class="service wait" id="service-${service.id}">
      <div class="service-head"><div class="service-name">${service.name}</div>
      <div class="service-state"><i class="dot"></i><span class="state">AGUARDANDO</span></div></div>
      <div class="service-url">${url}</div>
      <div class="uptime">${bars}</div>
      <div class="uptime-labels"><span>30 DIAS ATRÁS</span><span>HOJE</span></div>
    </article>`;
  }).join('');
}

async function check(service) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    if (service.kind === 'local') {
      const response = await fetch(`/?status-check=${Date.now()}`, {
        cache: 'no-store',
        signal: controller.signal
      });
      if (!response.ok) return false;
      const html = await response.text();
      return !/A QUALQUER MOMENTO/i.test(html);
    }

    const response = await fetch(service.url, {
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal
    });
    return response.type === 'opaque' || response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function runChecks() {
  const refresh = document.querySelector('#refresh');
  refresh.classList.add('checking');
  const results = await Promise.all(services.map(async service => [service, await check(service)]));
  let down = 0;

  for (const [service, up] of results) {
    const card = document.querySelector(`#service-${service.id}`);
    const state = up ? 'up' : 'down';
    if (!up) down++;
    card.classList.toggle('down', !up);
    card.classList.remove('wait');
    card.querySelector('.state').textContent = up
      ? 'OPERACIONAL'
      : service.id === 'societad' ? 'INATIVO' : 'FORA DO AR';

    const today = dayKey();
    history[service.id][today] = state;
    const bar = card.querySelector('.uptime span.today');
    bar?.classList.toggle('out', !up);
    bar?.classList.remove('unknown');
    if (bar) bar.title = `${today}: ${up ? 'Ativo' : 'Inativo'}`;
  }

  save();
  document.querySelector('#summary').innerHTML = down
    ? `ATENÇÃO · ${down} SERVIÇO${down > 1 ? 'S' : ''}<br><strong style="color:#ff7185">${down === services.length ? 'indisponíveis' : 'com instabilidade'}</strong>`
    : 'TODOS OS SISTEMAS<br><strong>operacionais</strong>';
  document.querySelector('#checked').textContent = 'Última verificação: ' +
    new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date());
  refresh.classList.remove('checking');
}

loadHistory();
render();
runChecks();
setInterval(runChecks, INTERVAL);
