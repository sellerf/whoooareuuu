const services = [
  { id: 'main', name: 'Linarc Team' },
  { id: 'panel', name: 'Painel' },
  { id: 'geo', name: 'Geolocalize' },
  { id: 'societad', name: 'societad.shop' }
];
const KEY = 'linarc-status-history-v1';
const INTERVAL = 30000;
const DAYS = 30;
let history = {};
try { history = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { history = {}; }
const dayKey = () => new Date().toISOString().slice(0, 10);

function loadHistory() {
  for (const service of services) {
    if (!history[service.id] || typeof history[service.id] !== 'object') history[service.id] = {};
    for (let i = DAYS - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const key = date.toISOString().slice(0, 10);
      history[service.id][key] ??= 'unknown';
    }
  }
}

function render() {
  document.querySelector('#services').innerHTML = services.map(service => {
    const days = history[service.id];
    const bars = Object.entries(days).slice(-30).map(([date, state], index) => {
      const stateClass = state === 'down' ? 'out' : state === 'unknown' ? 'unknown' : '';
      const label = state === 'up' ? 'Ativo' : state === 'down' ? 'Inativo' : 'Sem dados';
      return '<span class="' + stateClass + ' ' + (index === 29 ? 'today' : '') + '" title="' + date + ': ' + label + '"></span>';
    }).join('');
    const url = service.id === 'societad' ? 'societad.shop' :
      service.id === 'main' ? 'linarcteam.site' :
      service.id === 'panel' ? 'manddy.site' : 'societad.shop/geolocalize';
    return '<article class="service wait" id="service-' + service.id + '">' +
      '<div class="service-head"><div class="service-name">' + service.name + '</div>' +
      '<div class="service-state"><i class="dot"></i><span class="state">AGUARDANDO</span></div></div>' +
      '<div class="service-url">' + url + '</div><div class="uptime">' + bars + '</div>' +
      '<div class="uptime-labels"><span>30 DIAS ATRÁS</span><span>HOJE</span></div></article>';
  }).join('');
}

function showUnavailable() {
  document.querySelector('#summary').innerHTML = 'MONITORAMENTO<br><strong style="color:#ffd18b">sem resposta</strong>';
  document.querySelector('#checked').textContent = 'Falha ao consultar o endpoint de status';
  for (const service of services) {
    const card = document.querySelector('#service-' + service.id);
    card.classList.remove('wait');
    card.classList.add('down');
    card.querySelector('.state').textContent = 'SEM RESPOSTA';
  }
}

async function runChecks() {
  const refresh = document.querySelector('#refresh');
  refresh.classList.add('checking');
  try {
    const response = await fetch('/api/status?ts=' + Date.now(), { cache: 'no-store' });
    if (!response.ok) throw new Error('Status API returned ' + response.status);
    const result = await response.json();
    let down = 0;
    for (const service of services) {
      const up = result[service.id] === true;
      const card = document.querySelector('#service-' + service.id);
      if (!up) down++;
      card.classList.toggle('down', !up);
      card.classList.remove('wait');
      card.querySelector('.state').textContent = up ? 'OPERACIONAL' :
        service.id === 'societad' ? 'INATIVO' : 'FORA DO AR';
      const today = dayKey();
      history[service.id][today] = up ? 'up' : 'down';
      const bar = card.querySelector('.uptime span.today');
      if (bar) {
        bar.classList.toggle('out', !up);
        bar.classList.remove('unknown');
        bar.title = today + ': ' + (up ? 'Ativo' : 'Inativo');
      }
    }
    try { localStorage.setItem(KEY, JSON.stringify(history)); } catch {}
    document.querySelector('#summary').innerHTML = down
      ? 'ATENÇÃO · ' + down + ' SERVIÇO' + (down > 1 ? 'S' : '') +
        '<br><strong style="color:#ff7185">' + (down === services.length ? 'indisponíveis' : 'com instabilidade') + '</strong>'
      : 'TODOS OS SISTEMAS<br><strong>operacionais</strong>';
    document.querySelector('#checked').textContent = 'Última verificação: ' +
      new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date());
  } catch (error) {
    console.error('Falha na verificação do status:', error);
    showUnavailable();
  } finally {
    refresh.classList.remove('checking');
  }
}

loadHistory();
render();
runChecks();
setInterval(runChecks, INTERVAL);