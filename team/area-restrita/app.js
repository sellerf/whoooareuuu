(() => {
'use strict';

const TOKEN_KEY = 'linarc.token.v3';
/* Deriva a base pelo local do próprio arquivo: funciona em / e em subpastas. */
const scriptUrl = new URL(document.currentScript?.src || location.href, location.href);
const APP_BASE = scriptUrl.pathname.replace(/\/app\.js$/, '/').replace(/\/{2,}/g, '/');
const API_BASE = APP_BASE.replace(/\/$/, '') + '/api';
const OPTS = [
  { key: 'favor', label: 'A favor', shade: '#000' },
  { key: 'contra', label: 'Contra', shade: '#737373' },
  { key: 'abstencao', label: 'Abstenção', shade: '#c4c4c4' }
];
const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const FORBIDDEN = /['"`;\\<>=#]|--|\/\*|\*\//g;

let user = null;
let token = sessionStorage.getItem(TOKEN_KEY) || '';

const root = document.getElementById('app');

function el(tag, props, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return n;
}

const ICONS = {
  atual: '<path d="M4 13h16v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M9 17h6"/><path d="M8 13V4.6a.6.6 0 0 1 .6-.6h6.8a.6.6 0 0 1 .6.6V13"/><path d="M10.5 8.6l1.5 1.5 2.6-3.1"/>',
  nova: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 12v6M9 15h6"/>',
  lista: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" stroke-width="2.6"/>',
  historico: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7.5V12l3 2"/>',
  equipe: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17.5 14.5a5 5 0 0 1 4 5.5"/>',
  logs: '<path d="M4 5h16v14H4z"/><path d="M8 9h8M8 12h8M8 15h5"/>',
  sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  voltar: '<path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  olho: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  olhoOff: '<path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4"/><path d="M6.6 6.6C3.7 8.5 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 4.4-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M3 3l18 18"/>',
  cadeado: '<rect x="4.5" y="11" width="15" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
  alerta: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><path d="M12 16.5h.01" stroke-width="2.4"/>',
  ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  vazio: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 10h8M8 14h5"/>'
};

function icon(name, size = 24) {
  const s = el('span', { class: 'icon', 'aria-hidden': 'true' });
  s.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" focusable="false">${ICONS[name] || ''}</svg>`;
  return s;
}
const chip = (text, kind = 'line') => el('span', { class: 'chip chip--' + kind }, text);
const markEl = () => el('span', { class: 'mark', 'aria-hidden': 'true' }, 'L');

function fmtDate(s) {
  if (!s) return '';
  const d = String(s).length <= 10 ? new Date(s + 'T12:00:00') : new Date(s);
  if (Number.isNaN(+d)) return String(s);
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtDateTime(s) {
  const d = new Date(s);
  if (Number.isNaN(+d)) return String(s);
  return `${fmtDate(s)} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}
function optLabel(k) { return (OPTS.find(o => o.key === k) || {}).label || k; }
function localDate(t = Date.now()) {
  const d = new Date(t);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}
function clean(s) { return s.replace(FORBIDDEN, ''); }

function toast(msg) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = el('div', { class: 'toast', role: 'status' }, icon('ok', 18), msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 3200);
}

function confirmDialog({ title, text, confirmLabel }) {
  return new Promise(resolve => {
    const d = el('dialog', { class: 'dlg' },
      el('form', { method: 'dialog' },
        el('h3', {}, title),
        el('p', {}, text),
        el('div', { class: 'dlg__actions' },
          el('button', { class: 'btn btn--ghost btn--sm', value: 'cancel' }, 'Cancelar'),
          el('button', { class: 'btn btn--sm', value: 'ok' }, confirmLabel))));
    d.addEventListener('close', () => { const ok = d.returnValue === 'ok'; d.remove(); resolve(ok); });
    document.body.append(d);
    if (d.showModal) d.showModal(); else { d.remove(); resolve(window.confirm(text)); }
  });
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = 'Bearer ' + token;
  const endpoint = path.startsWith('/api')
    ? API_BASE + path.slice('/api'.length)
    : new URL(path, location.origin + APP_BASE).pathname;
  const res = await fetch(endpoint, { ...opts, headers });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (res.status === 401 && !path.includes('/login')) {
    token = ''; user = null; sessionStorage.removeItem(TOKEN_KEY);
    location.hash = '';
    route();
    throw new Error(data?.error || 'Sessão expirada');
  }
  if (!res.ok) throw new Error(data?.error || 'Falha na requisição');
  return data;
}

function tally(v) {
  const t = { favor: 0, contra: 0, abstencao: 0, total: 0 };
  for (const r of Object.values(v.votos || {})) { if (t[r.opcao] != null) { t[r.opcao]++; t.total++; } }
  return t;
}
function outcome(v) {
  const t = tally(v);
  if (!t.total) return 'Sem votos';
  if (t.favor > t.contra) return 'Aprovada';
  if (t.contra > t.favor) return 'Rejeitada';
  return 'Empate';
}

function mount(node) {
  root.replaceChildren(node);
  window.scrollTo(0, 0);
  const h = root.querySelector('.pagehead h1');
  if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
}

function shell(main) {
  return el('div', { class: 'app' },
    el('header', { class: 'topbar' },
      el('div', { class: 'container topbar__in' },
        el('a', { class: 'brand', href: '#/', 'aria-label': 'Linarc' },
          markEl(), el('span', { class: 'brand__name' }, 'Linarc'),
          el('span', { class: 'brand__sep', 'aria-hidden': 'true' }),
          el('span', { class: 'brand__area' }, 'Área Restrita')),
        el('div', { class: 'topbar__user' },
          el('div', { class: 'who' }, el('span', { class: 'who__name' }, user.name), chip(user.label, 'soft')),
          el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: logout },
            icon('sair', 18), el('span', { class: 'hide-sm' }, 'Sair'))))),
    main,
    el('footer', { class: 'foot' }, `© ${new Date().getFullYear()} Linarc Consultoria. Acesso restrito.`));
}

function pageHead({ back, title, sub, extra }) {
  return el('div', { class: 'pagehead' },
    back && el('a', { class: 'back', href: back.href }, icon('voltar', 18), back.label),
    el('h1', {}, title),
    sub && el('p', {}, sub),
    extra);
}

function emptyState(title, text) {
  return el('div', { class: 'empty' }, icon('vazio', 32), el('strong', {}, title), el('span', {}, text));
}

function statusChip(v) {
  return v.status === 'aberta' ? chip('Em andamento', 'solid') : chip(outcome(v), 'line');
}

function progress(v) {
  const n = v.progresso?.responded || 0;
  const total = v.progresso?.total || 1;
  return el('div', { class: 'progress' },
    el('div', { class: 'bar bar--thin', role: 'img', 'aria-label': `${n} de ${total}` },
      el('span', { style: `width:${Math.round(n / total * 100)}%;background:#000` })),
    el('span', {}, `${n} de ${total} responderam`));
}

function voteRow(v) {
  const can = user.can;
  const meta = [
    el('span', {}, 'Solicitada por ' + (v.autorNome || v.autor)),
    el('span', {}, fmtDate(v.criadoEm)),
    el('span', {}, v.status === 'aberta' ? 'Prazo: ' + fmtDate(v.prazo) : 'Encerrada em ' + fmtDate(v.encerradaEm))
  ];
  let side;
  if (v.status === 'aberta' && can.vote) {
    side = v.votos[user.key] ? chip('Voto registrado', 'soft') : chip('Aguardando seu voto', 'solid');
  } else side = statusChip(v);
  return el('a', { class: 'row', href: '#/v/' + v.id },
    el('div', { class: 'row__main' },
      el('div', { class: 'row__title' }, v.titulo),
      el('div', { class: 'meta' }, meta),
      v.status === 'aberta' && can.viewAll && el('div', { style: 'margin-top:12px' }, progress(v))),
    el('div', { class: 'row__side' }, side, icon('chevron', 20)));
}

function resultRows(v) {
  const t = tally(v);
  return el('div', { class: 'stack stack--sm' }, OPTS.map(o => {
    const n = t[o.key], pct = t.total ? Math.round(n / t.total * 100) : 0;
    return el('div', {},
      el('div', { class: 'res__top' },
        el('span', { class: 'res__label' }, o.label),
        el('span', { class: 'res__num' }, `${n} ${n === 1 ? 'voto' : 'votos'} (${pct}%)`)),
      el('div', { class: 'bar' }, el('span', { style: `width:${pct}%;background:${o.shade}` })));
  }));
}

function individualVotes(v, voters) {
  const list = Object.entries(v.votos || {}).sort((a, b) => String(a[1].em).localeCompare(String(b[1].em)));
  const pendentes = (voters || []).filter(k => !v.votos[k.key]).map(k => k.name);
  return el('div', {},
    list.length
      ? el('div', { class: 'votes' }, list.map(([k, r]) =>
          el('div', { class: 'vote' },
            el('div', { class: 'vote__head' },
              el('span', { class: 'vote__name' }, r.nome || k),
              chip(optLabel(r.opcao), r.opcao === 'favor' ? 'solid' : 'line')),
            r.justificativa && el('p', {}, r.justificativa),
            el('small', {}, fmtDate(r.em)))))
      : el('p', { class: 'prose' }, 'Ainda não há votos registrados.'),
    pendentes.length > 0 && v.status === 'aberta' &&
      el('div', { class: 'pending' }, 'Aguardando: ' + pendentes.join(', ') + '.'));
}

function viewLogin() {
  const msg = el('div', { class: 'notice', role: 'alert', hidden: true });
  const input = el('input', {
    id: 'code', type: 'password', autocomplete: 'off', autocapitalize: 'none',
    spellcheck: 'false', maxlength: '64', required: true, placeholder: 'Digite seu código'
  });
  const toggle = el('button', { class: 'toggle', type: 'button', 'aria-label': 'Mostrar código' }, icon('olho', 20));
  const submit = el('button', { class: 'btn btn--block', type: 'submit' }, 'Entrar');
  toggle.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    toggle.replaceChildren(icon(show ? 'olhoOff' : 'olho', 20));
    input.focus();
  });
  const form = el('form', {
    class: 'form', novalidate: true,
    onsubmit: async e => {
      e.preventDefault();
      submit.disabled = true; submit.textContent = 'Verificando…';
      msg.hidden = true;
      try {
        const data = await api('/api/login', { method: 'POST', body: JSON.stringify({ code: input.value.trim() }) });
        token = data.token;
        sessionStorage.setItem(TOKEN_KEY, token);
        user = data.user;
        location.hash = '#/';
        route();
      } catch (err) {
        input.value = '';
        msg.replaceChildren(icon('alerta', 18), el('span', {}, err.message || 'Código inválido.'));
        msg.hidden = false;
        submit.disabled = false; submit.textContent = 'Entrar';
        input.focus();
      }
    }
  },
    el('div', { class: 'field' },
      el('label', { for: 'code' }, 'Código de acesso'),
      el('div', { class: 'input-wrap' }, icon('cadeado', 20), input, toggle)),
    msg, submit);

  return el('div', { class: 'login' },
    el('div', { class: 'login__box' },
      el('div', { class: 'login__brand' }, markEl(), el('span', {}, 'Linarc')),
      el('div', { class: 'login__card' },
        el('h1', {}, 'Área Restrita'),
        el('p', {}, 'Informe seu código de acesso para continuar.'),
        form),
      el('p', { class: 'login__foot' }, 'Dados sincronizados com segurança na nuvem.')));
}

async function viewHome() {
  const open = (await api('/api/votes?status=aberta')).votes || [];
  const pending = user.can.vote ? open.filter(v => !v.votos[user.key]).length : 0;
  const tiles = [];
  if (user.can.vote) tiles.push({ href: '#/atual', icon: 'atual', label: 'Votação atual', badge: pending });
  if (user.can.create) tiles.push({ href: '#/nova', icon: 'nova', label: 'Nova solicitação de votação' });
  if (user.can.viewAll) tiles.push({ href: '#/votacoes', icon: 'lista', label: 'Ver votações', badge: open.length });
  tiles.push({ href: '#/historico', icon: 'historico', label: 'Histórico de votações' });
  if (user.can.team) tiles.push({ href: '#/equipe', icon: 'equipe', label: 'Equipe e acessos' });
  if (user.can.logs && user.key === 'lua') tiles.push({ href: '#/logs', icon: 'logs', label: 'Central de logs' });

  return shell(el('main', {},
    el('div', { class: 'container' },
      pageHead({ title: 'Serviços', sub: `Olá, ${user.name}. Escolha uma opção para continuar.` }),
      el('nav', { class: 'tiles', 'aria-label': 'Serviços' }, tiles.map(t =>
        el('a', { class: 'tile', href: t.href },
          icon(t.icon, 44),
          el('span', { class: 'tile__label' }, t.label),
          t.badge > 0 && el('span', { class: 'tile__badge' }, String(t.badge))))))));
}

async function viewList(kind) {
  const status = kind === 'historico' ? 'encerrada' : 'aberta';
  const data = await api('/api/votes?status=' + status);
  const list = data.votes || [];
  const titles = {
    atual: ['Votação atual', 'Abra a votação para registrar seu voto.'],
    votacoes: ['Votações em andamento', 'Acompanhe as respostas e os votos justificados.'],
    historico: ['Histórico de votações', 'Votações encerradas e seus resultados.']
  };
  const [title, sub] = titles[kind];
  return shell(el('main', {},
    el('div', { class: 'container container--narrow page-end' },
      pageHead({ back: { href: '#/', label: 'Voltar' }, title, sub }),
      list.length ? el('div', { class: 'stack' }, list.map(voteRow))
        : emptyState(kind === 'historico' ? 'Sem votações encerradas' : 'Nenhuma votação em andamento',
          kind === 'historico' ? 'O histórico aparece depois que a primeira votação terminar.' : 'Quando houver uma solicitação, ela aparece aqui.'))));
}

async function viewNova() {
  const err = el('div', { class: 'notice', role: 'alert', hidden: true });
  const inTitle = el('input', { id: 'titulo', type: 'text', maxlength: '80', autocomplete: 'off' });
  const inDesc = el('textarea', { id: 'desc', rows: '6', maxlength: '500' });
  const inDate = el('input', { id: 'prazo', type: 'date', min: localDate(), value: localDate(Date.now() + 3 * 86400000) });
  const cTitle = el('span', { class: 'counter' }, '0/80');
  const cDesc = el('span', { class: 'counter' }, '0/500');
  const submit = el('button', { class: 'btn', type: 'submit', disabled: true }, 'Enviar solicitação');
  const valid = () => inTitle.value.trim().length >= 5 && inDesc.value.trim().length >= 10 && inDate.value >= localDate();
  const update = () => {
    inTitle.value = clean(inTitle.value); inDesc.value = clean(inDesc.value);
    cTitle.textContent = `${inTitle.value.length}/80`;
    cDesc.textContent = `${inDesc.value.length}/500`;
    submit.disabled = !valid();
  };
  [inTitle, inDesc, inDate].forEach(c => c.addEventListener('input', update));

  const form = el('form', {
    class: 'card form', novalidate: true,
    onsubmit: async e => {
      e.preventDefault();
      if (!valid()) return;
      submit.disabled = true;
      try {
        const data = await api('/api/votes', {
          method: 'POST',
          body: JSON.stringify({ titulo: inTitle.value.trim(), descricao: inDesc.value.trim(), prazo: inDate.value })
        });
        toast('Solicitação enviada.');
        location.hash = '#/v/' + data.id;
      } catch (err2) {
        err.replaceChildren(icon('alerta', 18), el('span', {}, err2.message));
        err.hidden = false;
        submit.disabled = false;
      }
    }
  },
    el('div', { class: 'field' }, el('label', { for: 'titulo' }, 'Título'), inTitle, el('div', { class: 'field__foot' }, cTitle)),
    el('div', { class: 'field' }, el('label', { for: 'desc' }, 'Descrição'), inDesc, el('div', { class: 'field__foot' }, cDesc)),
    el('div', { class: 'field' }, el('label', { for: 'prazo' }, 'Prazo para votar'), inDate),
    err,
    el('div', { class: 'form__actions' }, submit, el('a', { class: 'btn btn--ghost', href: '#/' }, 'Cancelar')));

  return shell(el('main', {},
    el('div', { class: 'container container--narrow page-end' },
      pageHead({ back: { href: '#/', label: 'Voltar' }, title: 'Nova solicitação de votação',
        sub: 'Todos os votantes verão esta pauta em tempo real.' }),
      form)));
}

function voteForm(v) {
  let choice = null;
  const err = el('div', { class: 'notice', role: 'alert', hidden: true });
  const ta = el('textarea', { id: 'just', rows: '5', maxlength: '300', placeholder: 'Explique o motivo do seu voto' });
  const count = el('span', { class: 'counter' }, '0/300');
  const submit = el('button', { class: 'btn', type: 'submit', disabled: true }, 'Confirmar voto');
  const valid = () => !!choice && ta.value.trim().length >= 5;
  const update = () => { ta.value = clean(ta.value); count.textContent = `${ta.value.length}/300`; submit.disabled = !valid(); };
  ta.addEventListener('input', update);
  const radios = OPTS.map(o => {
    const input = el('input', { type: 'radio', name: 'opcao', value: o.key, id: 'opt-' + o.key, class: 'choice__input' });
    input.addEventListener('change', () => { choice = o.key; update(); });
    return el('label', { class: 'choice', for: 'opt-' + o.key }, input, el('span', { class: 'choice__mark' }), el('span', { class: 'choice__label' }, o.label));
  });
  return el('form', {
    class: 'card form', novalidate: true,
    onsubmit: async e => {
      e.preventDefault();
      if (!valid()) return;
      submit.disabled = true;
      try {
        await api('/api/votes/' + v.id + '/ballot', {
          method: 'POST',
          body: JSON.stringify({ opcao: choice, justificativa: ta.value.trim() })
        });
        toast('Voto registrado.');
        route();
      } catch (err2) {
        err.replaceChildren(icon('alerta', 18), el('span', {}, err2.message));
        err.hidden = false;
        submit.disabled = false;
      }
    }
  },
    el('div', { class: 'field' }, el('span', { class: 'label' }, 'Seu voto'), el('div', { class: 'choices' }, radios)),
    el('div', { class: 'field' }, el('label', { for: 'just' }, 'Justificativa'), ta,
      el('div', { class: 'field__foot' }, el('span', {}, 'Máximo de 300 caracteres.'), count)),
    err,
    el('p', { style: 'font-size:13.5px;color:var(--muted)' }, 'Depois de confirmado, o voto não pode ser alterado.'),
    el('div', { class: 'form__actions' }, submit));
}

async function viewDetalhe(id) {
  const data = await api('/api/votes/' + encodeURIComponent(id));
  const v = data.vote;
  const voters = data.voters || [];
  const can = user.can;
  const mine = v.votos[user.key];
  const back = v.status === 'encerrada'
    ? { href: '#/historico', label: 'Histórico' }
    : can.viewAll ? { href: '#/votacoes', label: 'Votações' } : { href: '#/atual', label: 'Votação atual' };

  const parts = [el('div', { class: 'card' }, el('p', { class: 'prose' }, v.descricao))];

  if (can.vote) {
    if (mine) {
      parts.push(el('section', { class: 'section' },
        el('h2', {}, 'Seu voto'),
        el('div', { class: 'card' },
          el('div', { class: 'vote__head' }, chip(optLabel(mine.opcao), mine.opcao === 'favor' ? 'solid' : 'line'),
            el('small', { style: 'color:var(--muted)' }, 'Registrado em ' + fmtDate(mine.em))),
          mine.justificativa && el('p', { class: 'prose', style: 'margin-top:14px' }, mine.justificativa))));
    } else if (v.status === 'aberta') {
      parts.push(el('section', { class: 'section' }, el('h2', {}, 'Votar'), voteForm(v)));
    }
  }

  if (can.viewAll) {
    parts.push(el('section', { class: 'section' },
      el('h2', {}, v.status === 'aberta' ? 'Resultado parcial' : 'Resultado final'),
      el('div', { class: 'card' }, resultRows(v))));
    parts.push(el('section', { class: 'section' },
      el('h2', {}, 'Votos e justificativas'),
      el('div', { class: 'card' }, individualVotes(v, voters))));
    if (can.close && v.status === 'aberta') {
      parts.push(el('section', { class: 'section' },
        el('button', {
          class: 'btn btn--ghost', type: 'button',
          onclick: async () => {
            const ok = await confirmDialog({
              title: 'Encerrar votação?',
              text: 'A votação vai para o histórico e ninguém mais poderá votar.',
              confirmLabel: 'Encerrar votação'
            });
            if (!ok) return;
            await api('/api/votes/' + v.id + '/close', { method: 'POST', body: '{}' });
            toast('Votação encerrada.');
            route();
          }
        }, 'Encerrar votação')));
    }
  } else if (v.status === 'encerrada') {
    parts.push(el('section', { class: 'section' },
      el('h2', {}, 'Resultado final'),
      el('div', { class: 'card' }, resultRows(v))));
  }

  return shell(el('main', {},
    el('div', { class: 'container container--narrow page-end' },
      pageHead({
        back, title: v.titulo,
        extra: el('div', { class: 'pagehead__meta' }, statusChip(v),
          el('div', { class: 'meta' },
            el('span', {}, 'Solicitada por ' + (v.autorNome || v.autor)),
            el('span', {}, fmtDate(v.criadoEm)),
            el('span', {}, v.status === 'aberta' ? 'Prazo: ' + fmtDate(v.prazo) : 'Encerrada em ' + fmtDate(v.encerradaEm))))
      }),
      parts)));
}

async function viewEquipe() {
  const data = await api('/api/team');
  return shell(el('main', {},
    el('div', { class: 'container container--narrow page-end' },
      pageHead({ back: { href: '#/', label: 'Voltar' }, title: 'Equipe e acessos', sub: 'Perfis ativos e permissões.' }),
      el('div', { class: 'stack' }, data.members.map(u =>
        el('div', { class: 'member' },
          el('span', { class: 'avatar' }, u.name[0]),
          el('div', { class: 'member__main' },
            el('div', { class: 'member__name' }, u.name),
            el('div', { class: 'member__perms' }, chip(u.label, 'solid'), u.perms.map(p => chip(p, 'line')))),
          el('div', { class: 'member__count' }, u.canVote ? `${u.votos} votos` : 'Não vota')))))));
}

async function viewLogs() {
  if (!(user.can.logs && user.key === 'lua')) {
    return shell(el('main', {}, el('div', { class: 'container container--narrow page-end' },
      pageHead({ back: { href: '#/', label: 'Voltar' }, title: 'Acesso negado' }),
      emptyState('Somente Lua', 'A central de logs é exclusiva do perfil Owner Lua.'))));
  }

  const stats = await api('/api/logs/stats');
  const qInput = el('input', { type: 'text', placeholder: 'Buscar (ação, IP, usuário…)', value: '' });
  const sevSel = el('select', {},
    el('option', { value: '' }, 'Todas severidades'),
    ...['debug','info','warn','error','critical'].map(s => el('option', { value: s }, s)));
  const actionInput = el('input', { type: 'text', placeholder: 'Ação exata (ex: auth.login_failed)' });
  const tableWrap = el('div', { class: 'card', style: 'padding:0;overflow:auto' });
  const metaLine = el('p', { style: 'margin:12px 0 0;font-size:13px;color:var(--muted)' });

  async function load() {
    const params = new URLSearchParams({ limit: '150' });
    if (qInput.value.trim()) params.set('q', qInput.value.trim());
    if (sevSel.value) params.set('severity', sevSel.value);
    if (actionInput.value.trim()) params.set('action', actionInput.value.trim());
    const data = await api('/api/logs?' + params.toString());
    metaLine.textContent = `${data.total} eventos no total · mostrando ${data.logs.length}`;
    const table = el('table', { class: 'log-table' },
      el('thead', {}, el('tr', {},
        el('th', {}, 'Quando'), el('th', {}, 'Severidade'), el('th', {}, 'Ação'),
        el('th', {}, 'Ator'), el('th', {}, 'IP'), el('th', {}, 'Detalhes'))),
      el('tbody', {}, data.logs.map(l => el('tr', {},
        el('td', {}, fmtDateTime(l.created_at)),
        el('td', {}, el('span', { class: 'sev sev--' + l.severity }, l.severity + (l.success ? '' : ' · fail'))),
        el('td', {}, el('code', {}, l.action)),
        el('td', {}, l.actor_name ? `${l.actor_name} (${l.actor_key})` : '—'),
        el('td', {}, l.ip || '—'),
        el('td', { class: 'log-details' }, typeof l.details === 'object' ? JSON.stringify(l.details) : String(l.details || ''))))));
    tableWrap.replaceChildren(table);
  }

  const filters = el('div', { class: 'log-filters' },
    qInput, sevSel, actionInput,
    el('button', { class: 'btn btn--sm', type: 'button', onclick: () => load().catch(e => toast(e.message)) }, 'Filtrar'),
    el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { qInput.value=''; sevSel.value=''; actionInput.value=''; load(); } }, 'Limpar'));

  await load();

  return shell(el('main', {},
    el('div', { class: 'container page-end' },
      pageHead({
        back: { href: '#/', label: 'Voltar' },
        title: 'Central de logs',
        sub: 'Auditoria completa — visível apenas para Lua (Owner). Cada acesso a esta tela também é registrado.'
      }),
      el('div', { class: 'log-stats' },
        el('div', { class: 'log-stat' }, el('strong', {}, String(stats.stats.logins24h)), el('span', {}, 'Logins (24h)')),
        el('div', { class: 'log-stat' }, el('strong', {}, String(stats.stats.fails24h)), el('span', {}, 'Falhas (24h)'))),
      filters, tableWrap, metaLine)));
}

async function logout() {
  try { await api('/api/logout', { method: 'POST', body: '{}' }); } catch { /* ignore */ }
  token = ''; user = null; sessionStorage.removeItem(TOKEN_KEY);
  location.hash = '';
  route();
}

async function route() {
  document.title = 'Área Restrita | Linarc';
  if (!token) { mount(viewLogin()); return; }
  try {
    if (!user) {
      const me = await api('/api/me');
      user = me.user;
    }
  } catch {
    mount(viewLogin()); return;
  }

  const [name, arg] = (location.hash || '').replace(/^#\/?/, '').split('/');
  try {
    let node;
    switch (name) {
      case 'atual': node = user.can.vote ? await viewList('atual') : null; break;
      case 'votacoes': node = user.can.viewAll ? await viewList('votacoes') : null; break;
      case 'historico': node = await viewList('historico'); break;
      case 'nova': node = user.can.create ? await viewNova() : null; break;
      case 'equipe': node = user.can.team ? await viewEquipe() : null; break;
      case 'logs': node = await viewLogs(); break;
      case 'v': node = arg ? await viewDetalhe(decodeURIComponent(arg)) : null; break;
      default: node = null;
    }
    mount(node || await viewHome());
  } catch (e) {
    mount(shell(el('main', {}, el('div', { class: 'container page-end' },
      pageHead({ title: 'Erro' }),
      el('div', { class: 'notice' }, icon('alerta', 18), el('span', {}, e.message || 'Falha'))))));
  }
}

window.addEventListener('hashchange', () => { route(); });
route();
})();
