/* Orçamentos — app de orçamentos de serviço. Dados ficam salvos no aparelho (localStorage). */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const num = s => parseFloat(String(s ?? '').replace(/\./g, m => (String(s).includes(',') ? '' : m)).replace(',', '.')) || 0;
const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const qtdFmt = n => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch { toast('Sem espaço para salvar. Use fotos menores ou remova alguma.'); return false; }
  }
};

let materiais = store.get('materiais', []);
let clientes = store.get('clientes', []);
let config = store.get('config', { empresa: '', telefone: '', valorHora: 0 });
let tab = 'materiais';
let step = 1;
let draft = novoDraft();

function novoDraft() {
  return { id: null, nome: '', telefone: '', endereco: '', plano: '', comodato: 'nao', obs: '',
    qtds: {}, snap: {}, servico: '', horas: '', valorHora: config.valorHora ? String(config.valorHora).replace('.', ',') : '' };
}

/* ---------- utilidades de interface ---------- */
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
}

function modal(html) {
  const o = document.createElement('div');
  o.className = 'overlay';
  o.innerHTML = `<div class="modal">${html}</div>`;
  o.addEventListener('click', e => { if (e.target === o) o.remove(); });
  document.body.appendChild(o);
  o.close = () => o.remove();
  return o;
}

function confirmar(msg, ok) {
  const m = modal(`<h3>Confirmar</h3><p>${esc(msg)}</p>
    <div class="row"><button class="btn sec spacer" data-no>Cancelar</button><button class="btn danger spacer" data-yes>Excluir</button></div>`);
  $('[data-no]', m).onclick = m.close;
  $('[data-yes]', m).onclick = () => { m.close(); ok(); };
}

function lerFoto(file) {
  return new Promise(res => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 480, s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', 0.72));
      };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  });
}

/* ---------- salvar / compartilhar arquivos (celular e computador) ---------- */
async function salvarArquivo(nome, dados, mime, base64) {
  const cap = window.Capacitor;
  if (cap && cap.isNativePlatform && cap.isNativePlatform()) {
    try {
      const { Filesystem, Share } = cap.Plugins;
      const conteudo = base64 ? dados : btoa(unescape(encodeURIComponent(dados)));
      const r = await Filesystem.writeFile({ path: nome, data: conteudo, directory: 'CACHE' });
      await Share.share({ title: nome, url: r.uri, dialogTitle: 'Enviar ou salvar arquivo' });
    } catch (e) {
      if (!String(e && e.message || e).toLowerCase().includes('cancel')) toast('Não foi possível salvar o arquivo.');
    }
    return;
  }
  const blob = base64
    ? new Blob([Uint8Array.from(atob(dados), c => c.charCodeAt(0))], { type: mime })
    : new Blob([dados], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------- tema ---------- */
function aplicarTema(t) {
  document.documentElement.dataset.theme = t;
  store.set('tema', t);
  const m = $('meta[name=theme-color]'); if (m) m.content = t === 'dark' ? '#151922' : '#ffffff';
}
aplicarTema(store.get('tema', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
$('#btn-theme').onclick = () => aplicarTema(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');

/* ---------- navegação ---------- */
$$('.tabs button').forEach(b => b.onclick = () => ir(b.dataset.tab));
function ir(t) {
  tab = t;
  $$('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  $('#page-title').textContent = { materiais: 'Materiais', novo: draft.id ? 'Editar cliente' : 'Novo cliente', clientes: 'Clientes salvos' }[t];
  render();
  window.scrollTo(0, 0);
}
function render() { ({ materiais: viewMateriais, novo: viewNovo, clientes: viewClientes })[tab](); }

/* ================= ABA MATERIAIS ================= */
function viewMateriais() {
  $('#view').innerHTML = `
    <div class="row wrap" style="margin-bottom:12px">
      <button class="btn" id="m-add">+ Adicionar</button>
      <span class="spacer"></span>
      <button class="btn sec small" id="m-exp">⬇ Baixar materiais</button>
      <button class="btn sec small" id="m-imp">⬆ Importar</button>
    </div>
    ${materiais.length ? materiais.map(m => `
      <div class="card item" data-id="${m.id}">
        ${m.foto ? `<img class="thumb" src="${m.foto}" alt="">` : `<div class="thumb">${m.tipo === 'cabo' ? '🔌' : '📦'}</div>`}
        <div class="info">
          <div class="nome">${esc(m.nome)}<span class="badge">${m.tipo === 'cabo' ? 'cabo · por metro' : 'material'}</span></div>
          <div class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(m.descricao) || '&nbsp;'}</div>
          <div class="price">${brl(m.valor)}${m.tipo === 'cabo' ? ' /m' : ''}</div>
        </div>
        <div class="row">
          <button class="btn sec small" data-edit="${m.id}">✎</button>
          <button class="btn sec small" data-del="${m.id}">🗑</button>
        </div>
      </div>`).join('') : `<div class="empty">Nenhum material salvo ainda.<br>Toque em “+ Adicionar” para começar.</div>`}`;
  $('#m-add').onclick = () => formMaterial();
  $('#m-exp').onclick = exportarMateriais;
  $('#m-imp').onclick = () => $('#file-import').click();
  $$('[data-edit]').forEach(b => b.onclick = () => formMaterial(materiais.find(m => m.id === b.dataset.edit)));
  $$('[data-del]').forEach(b => b.onclick = () => confirmar('Excluir este material da lista? Orçamentos já salvos não mudam.', () => {
    materiais = materiais.filter(m => m.id !== b.dataset.del); store.set('materiais', materiais); render();
  }));
}

function formMaterial(m) {
  const novo = !m;
  m = m || { id: uid(), nome: '', tipo: 'material', valor: '', descricao: '', foto: '' };
  let foto = m.foto || '';
  const o = modal(`
    <h3>${novo ? 'Novo material' : 'Editar material'}</h3>
    <label>Nome</label><input type="text" id="f-nome" value="${esc(m.nome)}" placeholder="Ex.: Conector SC/APC">
    <div class="grid2">
      <div><label>Tipo</label>
        <select id="f-tipo"><option value="material">Material / produto</option><option value="cabo">Cabo (cobrado por metro)</option></select></div>
      <div><label id="f-vl">Valor (R$)</label><input type="text" id="f-valor" inputmode="decimal" value="${m.valor !== '' ? String(m.valor).replace('.', ',') : ''}" placeholder="0,00"></div>
    </div>
    <label>Descrição (opcional)</label><textarea id="f-desc">${esc(m.descricao)}</textarea>
    <label>Foto (opcional)</label>
    <input type="file" id="f-foto" accept="image/*">
    <img class="photo-prev" id="f-prev" src="${foto}" ${foto ? '' : 'hidden'} alt="">
    <div class="row" style="margin-top:16px">
      <button class="btn sec spacer" id="f-cancel">Cancelar</button>
      <button class="btn spacer" id="f-save">Salvar</button>
    </div>`);
  $('#f-tipo', o).value = m.tipo;
  const atualizaRot = () => $('#f-vl', o).textContent = $('#f-tipo', o).value === 'cabo' ? 'Valor por metro (R$)' : 'Valor (R$)';
  $('#f-tipo', o).onchange = atualizaRot; atualizaRot();
  $('#f-foto', o).onchange = async e => {
    if (!e.target.files[0]) return;
    foto = await lerFoto(e.target.files[0]);
    const p = $('#f-prev', o); p.src = foto; p.hidden = false;
  };
  $('#f-cancel', o).onclick = o.close;
  $('#f-save', o).onclick = () => {
    const nome = $('#f-nome', o).value.trim();
    if (!nome) return toast('Digite o nome do material.');
    const novoM = { id: m.id, nome, tipo: $('#f-tipo', o).value, valor: num($('#f-valor', o).value), descricao: $('#f-desc', o).value.trim(), foto };
    const i = materiais.findIndex(x => x.id === m.id);
    if (i >= 0) materiais[i] = novoM; else materiais.push(novoM);
    materiais.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    if (store.set('materiais', materiais)) { o.close(); render(); }
  };
}

function exportarMateriais() {
  if (!materiais.length) return toast('Nenhum material para baixar.');
  salvarArquivo('materiais.json', JSON.stringify({ app: 'orcamentos', versao: 1, materiais }), 'application/json');
}
$('#file-import').onchange = async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    const lista = Array.isArray(d) ? d : d.materiais;
    if (!Array.isArray(lista)) throw 0;
    let n = 0;
    lista.forEach(x => {
      if (!x || !x.nome) return;
      const item = { id: x.id || uid(), nome: String(x.nome), tipo: x.tipo === 'cabo' ? 'cabo' : 'material',
        valor: Number(x.valor) || 0, descricao: x.descricao || '', foto: x.foto || '' };
      const i = materiais.findIndex(m => m.id === item.id);
      if (i >= 0) materiais[i] = item; else materiais.push(item);
      n++;
    });
    materiais.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    store.set('materiais', materiais);
    toast(`${n} material(is) importado(s).`);
    if (tab === 'materiais') render();
  } catch { toast('Arquivo inválido.'); }
};

/* ================= ABA CLIENTE (passo a passo) ================= */
function itensDoDraft() {
  return Object.entries(draft.qtds)
    .filter(([, q]) => q > 0)
    .map(([id, qtd]) => {
      const m = materiais.find(x => x.id === id) || draft.snap[id];
      return m ? { id, nome: m.nome, tipo: m.tipo, valor: m.valor, descricao: m.descricao || '', qtd } : null;
    }).filter(Boolean);
}
function calcular(itens, servico, horas, valorHora) {
  const mat = itens.reduce((s, i) => s + i.valor * i.qtd, 0);
  const hora = num(horas) * num(valorHora);
  const serv = num(servico);
  return { mat, hora, serv, total: mat + hora + serv };
}

function viewNovo() {
  const bar = `<div class="steps">${[1, 2, 3].map(i => `<div class="${i <= step ? 'on' : ''}"></div>`).join('')}</div>`;
  if (step === 1) return passo1(bar);
  if (step === 2) return passo2(bar);
  passo3(bar);
}

function passo1(bar) {
  $('#view').innerHTML = `${bar}<h2>1. Dados do cliente</h2><div class="card">
    <label>Nome</label><input type="text" id="c-nome" value="${esc(draft.nome)}">
    <label>Telefone</label><input type="tel" id="c-tel" value="${esc(draft.telefone)}" placeholder="(00) 00000-0000">
    <label>Endereço</label><input type="text" id="c-end" value="${esc(draft.endereco)}">
    <div class="grid2">
      <div><label>Plano</label><input type="text" id="c-plano" value="${esc(draft.plano)}" placeholder="Ex.: 500 Mega"></div>
      <div><label>Comodato?</label><select id="c-com"><option value="nao">Não</option><option value="sim">Sim, comodato</option></select></div>
    </div>
    <label>Observações</label><textarea id="c-obs">${esc(draft.obs)}</textarea>
  </div>
  <div class="row">
    ${draft.id ? '<button class="btn sec spacer" id="c-cancel">Cancelar edição</button>' : ''}
    <button class="btn spacer" id="c-next">Salvar e escolher materiais →</button>
  </div>`;
  $('#c-com').value = draft.comodato;
  $('#c-next').onclick = () => {
    draft.nome = $('#c-nome').value.trim(); draft.telefone = $('#c-tel').value.trim();
    draft.endereco = $('#c-end').value.trim(); draft.plano = $('#c-plano').value.trim();
    draft.comodato = $('#c-com').value; draft.obs = $('#c-obs').value.trim();
    if (!draft.nome) return toast('Digite o nome do cliente.');
    step = 2; render(); window.scrollTo(0, 0);
  };
  if (draft.id) $('#c-cancel').onclick = () => { draft = novoDraft(); step = 1; ir('clientes'); };
}

function passo2(bar) {
  const lista = materiais.length ? materiais.map(m => `
    <div class="card item">
      ${m.foto ? `<img class="thumb" src="${m.foto}" alt="">` : `<div class="thumb">${m.tipo === 'cabo' ? '🔌' : '📦'}</div>`}
      <div class="info">
        <div class="nome">${esc(m.nome)}</div>
        <div class="price">${brl(m.valor)}${m.tipo === 'cabo' ? ' /m' : ''}</div>
      </div>
      <div>
        <input type="text" class="qty" inputmode="decimal" data-q="${m.id}" placeholder="${m.tipo === 'cabo' ? 'metros' : 'qtd'}" value="${draft.qtds[m.id] ? qtdFmt(draft.qtds[m.id]) : ''}">
        <div class="muted" style="text-align:center">${m.tipo === 'cabo' ? 'metros' : 'unid.'}</div>
      </div>
    </div>`).join('')
    : `<div class="empty">Você ainda não salvou materiais.<br>Vá na aba “Materiais” para cadastrar ou importar.</div>`;
  $('#view').innerHTML = `${bar}<h2>2. Materiais — ${esc(draft.nome)}</h2>${lista}
    <div class="row"><button class="btn sec spacer" id="b-back">← Voltar</button><button class="btn spacer" id="b-next">Continuar →</button></div>
    <div class="totalbar"><span>Materiais</span><span id="tb">${brl(calcular(itensDoDraft()).mat)}</span></div>`;
  $$('[data-q]').forEach(i => i.oninput = () => {
    const q = num(i.value);
    if (q > 0) draft.qtds[i.dataset.q] = q; else delete draft.qtds[i.dataset.q];
    $('#tb').textContent = brl(calcular(itensDoDraft()).mat);
  });
  $('#b-back').onclick = () => { step = 1; render(); };
  $('#b-next').onclick = () => { step = 3; render(); window.scrollTo(0, 0); };
}

function passo3(bar) {
  $('#view').innerHTML = `${bar}<h2>3. Serviço e total</h2>
    <div class="card">
      <label>Valor do serviço (R$) — opcional</label><input type="text" id="s-serv" inputmode="decimal" value="${esc(draft.servico)}" placeholder="0,00">
      <div class="grid2">
        <div><label>Horas técnicas — opcional</label><input type="text" id="s-horas" inputmode="decimal" value="${esc(draft.horas)}" placeholder="0"></div>
        <div><label>Valor da hora (R$)</label><input type="text" id="s-vh" inputmode="decimal" value="${esc(draft.valorHora)}" placeholder="0,00"></div>
      </div>
    </div>
    <div class="card sum" id="resumo"></div>
    <div class="row"><button class="btn sec spacer" id="b-back">← Voltar</button><button class="btn spacer" id="b-fin">✔ Finalizar ficha</button></div>`;
  const atualiza = () => {
    draft.servico = $('#s-serv').value; draft.horas = $('#s-horas').value; draft.valorHora = $('#s-vh').value;
    const itens = itensDoDraft(), c = calcular(itens, draft.servico, draft.horas, draft.valorHora);
    $('#resumo').innerHTML = `
      <div><span>Materiais (${itens.length} item${itens.length === 1 ? '' : 's'})</span><span>${brl(c.mat)}</span></div>
      <div><span>Serviço</span><span>${brl(c.serv)}</span></div>
      <div><span>Hora técnica (${qtdFmt(num(draft.horas))} h)</span><span>${brl(c.hora)}</span></div>
      <div class="total"><span>Total</span><span>${brl(c.total)}</span></div>`;
  };
  ['#s-serv', '#s-horas', '#s-vh'].forEach(s => $(s).oninput = atualiza);
  atualiza();
  $('#b-back').onclick = () => { step = 2; render(); };
  $('#b-fin').onclick = () => {
    const itens = itensDoDraft(), c = calcular(itens, draft.servico, draft.horas, draft.valorHora);
    const reg = {
      id: draft.id || uid(), data: draft.data || new Date().toISOString(),
      nome: draft.nome, telefone: draft.telefone, endereco: draft.endereco, plano: draft.plano,
      comodato: draft.comodato, obs: draft.obs, itens,
      servico: num(draft.servico), horas: num(draft.horas), valorHora: num(draft.valorHora), total: c.total
    };
    const i = clientes.findIndex(x => x.id === reg.id);
    if (i >= 0) clientes[i] = reg; else clientes.unshift(reg);
    if (num(draft.valorHora) > 0 && !config.valorHora) { config.valorHora = num(draft.valorHora); store.set('config', config); }
    if (!store.set('clientes', clientes)) return;
    toast('Ficha salva!');
    draft = novoDraft(); step = 1; ir('clientes');
  };
}

/* ================= ABA CLIENTES SALVOS ================= */
function viewClientes(filtro = '') {
  const f = filtro.trim().toLowerCase();
  const lista = clientes.filter(c => !f || c.nome.toLowerCase().includes(f) || (c.telefone || '').includes(f));
  $('#view').innerHTML = `
    <input type="search" id="busca" placeholder="Buscar cliente..." value="${esc(filtro)}" style="margin-bottom:12px">
    ${lista.length ? lista.map(c => `
      <div class="card item" data-c="${c.id}" style="cursor:pointer">
        <div class="thumb">👤</div>
        <div class="info">
          <div class="nome">${esc(c.nome)}</div>
          <div class="muted">${new Date(c.data).toLocaleDateString('pt-BR')}${c.telefone ? ' · ' + esc(c.telefone) : ''}</div>
        </div>
        <div class="price">${brl(c.total)}</div>
      </div>`).join('') : `<div class="empty">${clientes.length ? 'Nenhum resultado.' : 'Nenhum cliente salvo ainda.'}</div>`}`;
  const b = $('#busca');
  b.oninput = () => { const p = b.selectionStart; viewClientes(b.value); const n = $('#busca'); n.focus(); n.setSelectionRange(p, p); };
  $$('[data-c]').forEach(el => el.onclick = () => detalhe(clientes.find(c => c.id === el.dataset.c)));
}

function detalhe(c) {
  const t = calcular(c.itens, c.servico, c.horas, c.valorHora);
  const o = modal(`
    <h3>${esc(c.nome)}</h3>
    <div class="muted">${new Date(c.data).toLocaleDateString('pt-BR')}</div>
    <div class="card" style="margin-top:10px">
      ${c.telefone ? `<div>📞 ${esc(c.telefone)}</div>` : ''}
      ${c.endereco ? `<div>📍 ${esc(c.endereco)}</div>` : ''}
      <div>📶 ${esc(c.plano) || 'Plano não informado'} · ${c.comodato === 'sim' ? 'Comodato' : 'Sem comodato'}</div>
      ${c.obs ? `<div class="muted" style="margin-top:6px">${esc(c.obs)}</div>` : ''}
    </div>
    <div class="card sum">
      ${c.itens.map(i => `<div><span>${esc(i.nome)} <span class="muted">× ${qtdFmt(i.qtd)}${i.tipo === 'cabo' ? ' m' : ''}</span></span><span>${brl(i.valor * i.qtd)}</span></div>`).join('')}
      ${t.serv ? `<div><span>Serviço</span><span>${brl(t.serv)}</span></div>` : ''}
      ${t.hora ? `<div><span>Hora técnica (${qtdFmt(c.horas)} h)</span><span>${brl(t.hora)}</span></div>` : ''}
      <div class="total"><span>Total</span><span>${brl(t.total)}</span></div>
    </div>
    <button class="btn block" id="d-pdf">⬇ Baixar PDF</button>
    <div class="row" style="margin-top:8px">
      <button class="btn sec spacer" id="d-edit">✎ Editar</button>
      <button class="btn sec spacer" id="d-del" style="color:var(--danger)">🗑 Excluir</button>
      <button class="btn sec spacer" id="d-close">Fechar</button>
    </div>`);
  $('#d-close', o).onclick = o.close;
  $('#d-pdf', o).onclick = () => gerarPDF(c);
  $('#d-del', o).onclick = () => confirmar(`Excluir o cliente “${c.nome}”?`, () => {
    clientes = clientes.filter(x => x.id !== c.id); store.set('clientes', clientes); o.close(); render();
  });
  $('#d-edit', o).onclick = () => {
    o.close();
    draft = { id: c.id, data: c.data, nome: c.nome, telefone: c.telefone, endereco: c.endereco, plano: c.plano,
      comodato: c.comodato, obs: c.obs, qtds: {}, snap: {}, servico: c.servico ? String(c.servico).replace('.', ',') : '',
      horas: c.horas ? String(c.horas).replace('.', ',') : '', valorHora: c.valorHora ? String(c.valorHora).replace('.', ',') : '' };
    c.itens.forEach(i => { draft.qtds[i.id] = i.qtd; draft.snap[i.id] = i; });
    step = 1; ir('novo');
  };
}

/* ================= PDF ================= */
function carregarLogo() {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      res({ data: c.toDataURL('image/png'), w: img.width, h: img.height });
    };
    img.onerror = () => res(null);
    img.src = 'logo.png';
  });
}

async function gerarPDF(c) {
  if (!window.jspdf) return toast('Biblioteca de PDF não carregada.');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 14;
  const logo = await carregarLogo();
  const t = calcular(c.itens, c.servico, c.horas, c.valorHora);

  // Faixa superior escura com a logo
  doc.setFillColor(10, 12, 18); doc.rect(0, 0, W, 38, 'F');
  doc.setFillColor(77, 131, 255); doc.rect(0, 38, W * 0.55, 1.4, 'F');
  doc.setFillColor(164, 104, 255); doc.rect(W * 0.55, 38, W * 0.45, 1.4, 'F');
  if (logo) {
    const h = 24, w = Math.min(60, h * logo.w / logo.h), hh = w * logo.h / logo.w;
    doc.addImage(logo.data, 'PNG', M, 7 + (24 - Math.min(hh, 24)) / 2, w * (Math.min(hh, 24) / hh), Math.min(hh, 24));
  }
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text('ORÇAMENTO', W - M, 18, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(200, 205, 215);
  doc.text(new Date(c.data).toLocaleDateString('pt-BR'), W - M, 25, { align: 'right' });
  if (config.empresa) doc.text(config.empresa + (config.telefone ? ' · ' + config.telefone : ''), W - M, 31, { align: 'right' });

  // Dados do cliente
  let y = 50;
  doc.setTextColor(20, 24, 31); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text('Cliente', M, y); y += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
  const linhas = [
    ['Nome', c.nome], ['Telefone', c.telefone], ['Endereço', c.endereco],
    ['Plano', (c.plano || '-') + (c.comodato === 'sim' ? '  (Comodato)' : '  (Sem comodato)')]
  ].filter(l => l[1]);
  linhas.forEach(([k, v]) => {
    doc.setTextColor(110, 118, 130); doc.text(k + ':', M, y);
    doc.setTextColor(20, 24, 31);
    const partes = doc.splitTextToSize(String(v), W - M * 2 - 24);
    doc.text(partes, M + 24, y); y += 5.6 * partes.length;
  });
  if (c.obs) {
    y += 1; doc.setTextColor(110, 118, 130); doc.text('Obs.:', M, y);
    doc.setTextColor(20, 24, 31);
    const p = doc.splitTextToSize(c.obs, W - M * 2 - 24); doc.text(p, M + 24, y); y += 5.6 * p.length;
  }

  // Tabela
  y += 6;
  const cab = () => {
    doc.setFillColor(238, 241, 247); doc.rect(M, y - 5, W - M * 2, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(60, 66, 78);
    doc.text('Item', M + 2, y); doc.text('Qtd.', 118, y, { align: 'right' });
    doc.text('Valor unit.', 152, y, { align: 'right' }); doc.text('Subtotal', W - M - 2, y, { align: 'right' });
    y += 7;
  };
  cab();
  doc.setFontSize(10);
  c.itens.forEach(i => {
    const nome = doc.splitTextToSize(i.nome, 85);
    const desc = i.descricao ? doc.splitTextToSize(i.descricao, 85) : [];
    const altura = nome.length * 5 + desc.length * 4.2 + 3;
    if (y + altura > 270) { doc.addPage(); y = 20; cab(); }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(20, 24, 31);
    doc.text(nome, M + 2, y);
    doc.text(qtdFmt(i.qtd) + (i.tipo === 'cabo' ? ' m' : ''), 118, y, { align: 'right' });
    doc.text(brl(i.valor) + (i.tipo === 'cabo' ? '/m' : ''), 152, y, { align: 'right' });
    doc.text(brl(i.valor * i.qtd), W - M - 2, y, { align: 'right' });
    let yy = y + nome.length * 5;
    if (desc.length) { doc.setFontSize(8.5); doc.setTextColor(120, 126, 138); doc.text(desc, M + 2, yy - 0.5); yy += desc.length * 4.2; }
    doc.setDrawColor(228, 232, 240); doc.line(M, yy, W - M, yy);
    y = yy + 5;
  });
  if (!c.itens.length) { doc.setTextColor(120); doc.text('Nenhum material.', M + 2, y); y += 8; }

  // Totais
  if (y > 235) { doc.addPage(); y = 25; }
  y += 4;
  const linhaTot = (rot, val) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(60, 66, 78);
    doc.text(rot, 120, y); doc.text(val, W - M - 2, y, { align: 'right' }); y += 6.5;
  };
  linhaTot('Materiais', brl(t.mat));
  if (t.serv) linhaTot('Serviço', brl(t.serv));
  if (t.hora) linhaTot(`Hora técnica (${qtdFmt(c.horas)} h × ${brl(c.valorHora)})`, brl(t.hora));
  y += 1;
  doc.setFillColor(10, 12, 18); doc.roundedRect(112, y - 5, W - M - 112, 12, 2, 2, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.setTextColor(255);
  doc.text('TOTAL', 117, y + 3); doc.text(brl(t.total), W - M - 4, y + 3, { align: 'right' });

  // Rodapé
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(140, 146, 158);
  doc.text('Orçamento sujeito a confirmação.', W / 2, 288, { align: 'center' });

  const nomeArq = 'Orcamento_' + c.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_') + '.pdf';
  const base64 = doc.output('datauristring').split(',')[1];
  salvarArquivo(nomeArq, base64, 'application/pdf', true);
}

/* ================= CONFIGURAÇÕES ================= */
$('#btn-config').onclick = () => {
  const o = modal(`<h3>Configurações</h3>
    <label>Nome da empresa (aparece no PDF)</label><input type="text" id="g-emp" value="${esc(config.empresa)}">
    <label>Telefone da empresa</label><input type="tel" id="g-tel" value="${esc(config.telefone)}">
    <label>Valor padrão da hora técnica (R$)</label><input type="text" id="g-vh" inputmode="decimal" value="${config.valorHora ? String(config.valorHora).replace('.', ',') : ''}">
    <div class="row" style="margin-top:16px"><button class="btn sec spacer" id="g-c">Cancelar</button><button class="btn spacer" id="g-s">Salvar</button></div>`);
  $('#g-c', o).onclick = o.close;
  $('#g-s', o).onclick = () => {
    config = { empresa: $('#g-emp', o).value.trim(), telefone: $('#g-tel', o).value.trim(), valorHora: num($('#g-vh', o).value) };
    store.set('config', config);
    if (!draft.id && !draft.valorHora && config.valorHora) draft.valorHora = String(config.valorHora).replace('.', ',');
    o.close(); toast('Configurações salvas.');
  };
};

/* ================= INÍCIO ================= */
setTimeout(() => $('#splash').classList.add('hide'), 2600);
setTimeout(() => $('#splash').remove(), 3300);
ir('materiais');
