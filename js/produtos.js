import { db, auth, ref, push, set, get, update } from './firebase-config.js';
import { $, parseFloatSafe, parseIntSafe } from './utils.js';
import { Etiqueta } from './impressora.js';

/* =========================
   ESTADO GLOBAL
========================= */

const modal = new bootstrap.Modal(document.getElementById('modalEstoque'));
const produtosCache = {};

let modoAtual = null;
let produtoAtualId = null;

/* =========================
   ELEMENTOS
========================= */

const btnNovo = document.getElementById('btn-novo-produto');
const btnConfirmar = document.getElementById('btn-confirmar-modal');
const inputBusca = document.getElementById('busca-produto');

/* =========================
   MODAL CADASTRO
========================= */

btnNovo.addEventListener('click', abrirCadastro);

function abrirCadastro() {
    modoAtual = 'cadastro';
    produtoAtualId = null;

    limparFormulario();

    document.getElementById('modal-title-estoque').textContent = 'Cadastro de Produto';
    document.getElementById('modal-produto-form').style.display = 'block';
    document.getElementById('modal-movimento').style.display = 'none';

    btnConfirmar.textContent = 'Salvar Produto';

    modal.show();
}

/* =========================
   SALVAR PRODUTO
========================= */

async function salvarProduto() {

    const id = $('produto-id').value;

    const produto = {
        codigoBarras: $('prod-codigo').value.trim(),
        descricao: $('prod-descricao').value.trim(),
        valorCusto: parseFloatSafe($('prod-custo').value),
        valorVenda: parseFloatSafe($('prod-venda').value),
        precoAtacado: parseFloatSafe($('prod-preco-atacado').value),
        quantidadeMinimaAtacado: parseIntSafe($('prod-qtd-min-atacado').value)
    };

    const estoqueInicial = parseFloatSafe($('prod-estoque').value);

    if (!produto.descricao || !produto.codigoBarras) {
        window.mostrarAlertaSistema('Preencha descrição e código de barras', 'Erro');
        return;
    }

    if (id) {
        await update(ref(db, 'produtos/' + id), produto);
    } else {
        produto.estoque = estoqueInicial;

        const novoRef = push(ref(db, 'produtos'));
        await set(novoRef, produto);

        if (estoqueInicial > 0) {
            await registrarMovimento(novoRef.key, estoqueInicial, 'Entrada', 'Cadastro inicial');
        }
    }

    modal.hide();
    await carregarProdutos();
}

/* =========================
   ENTRADA / SAÍDA
========================= */

function abrirEntrada(id) {
    const p = produtosCache[id];

    modoAtual = 'entrada';
    produtoAtualId = id;

    prepararMovimento('Entrada de Estoque', p);
}

function abrirSaida(id) {
    const p = produtosCache[id];

    modoAtual = 'saida';
    produtoAtualId = id;

    prepararMovimento('Saída de Estoque', p);
}

function prepararMovimento(titulo, produto) {

    document.getElementById('modal-title-estoque').textContent = titulo;
    document.getElementById('mov-produto-nome').textContent = produto.descricao;

    document.getElementById('mov-quantidade').value = '';

    document.getElementById('modal-produto-form').style.display = 'none';
    document.getElementById('modal-movimento').style.display = 'block';

    btnConfirmar.textContent =
        modoAtual === 'entrada' ? 'Adicionar' : 'Baixar';

    modal.show();
}

/* =========================
   CONFIRMAR AÇÃO
========================= */

btnConfirmar.addEventListener('click', async () => {

    if (modoAtual === 'cadastro') {
        await salvarProduto();
        return;
    }

    const qtd = parseFloat(document.getElementById('mov-quantidade').value);
    const motivo = document.getElementById('mov-motivo').value.trim();

    if (!qtd || qtd <= 0) return;

    const p = produtosCache[produtoAtualId];

    let estoque = p.estoque || 0;

    if (modoAtual === 'entrada') estoque += qtd;
    if (modoAtual === 'saida') estoque -= qtd;

    if (estoque < 0) {
        window.mostrarAlertaSistema('Estoque negativo não permitido', 'Erro');
        return;
    }

    await update(ref(db, 'produtos/' + produtoAtualId), {
        estoque
    });

    await registrarMovimento(produtoAtualId, qtd, modoAtual, 'Movimentação manual', motivo || 'Sem observação');

    modal.hide();
    await carregarProdutos();
});

/* =========================
   MOVIMENTAÇÃO
========================= */

async function registrarMovimento(produtoId, qtd, tipo, motivo) {

    const user = auth.currentUser?.email || 'Sistema';

    await set(push(ref(db, 'movimentacoesEstoque')), {
        produtoId,
        quantidade: qtd,
        tipo,
        motivo,
        usuario: user,
        data: new Date().toISOString()
    });
}

/* =========================
   CARREGAR PRODUTOS
========================= */

async function carregarProdutos() {

    const tabela = document.getElementById('tabela-produtos');
    tabela.innerHTML = '<tr><td colspan="8">Carregando...</td></tr>';

    const snap = await get(ref(db, 'produtos'));

    if (!snap.exists()) {
        tabela.innerHTML = '<tr><td colspan="8">Sem produtos</td></tr>';
        return;
    }

    Object.assign(produtosCache, snap.val());

    renderTabela(produtosCache);
}

/* =========================
   TABELA
========================= */

function renderTabela(produtos) {

    const tabela = document.getElementById('tabela-produtos');
    tabela.innerHTML = '';

    Object.entries(produtos).forEach(([id, p]) => {

        const custo = p.valorCusto || 0;
        const venda = p.valorVenda || 0;
        const margem = venda ? ((venda - custo) / venda) * 100 : 0;

        const tr = document.createElement('tr');

        tr.innerHTML = `
            <td>${p.codigoBarras || '-'}</td>
            <td>${p.descricao}</td>
            <td>R$ ${custo.toFixed(2)}</td>
            <td>R$ ${venda.toFixed(2)}</td>
            <td>${margem.toFixed(1)}%</td>
            <td>R$ ${(p.precoAtacado || 0).toFixed(2)}</td>
            <td><b>${p.estoque || 0}</b></td>
            <td>
                <button class="btn btn-warning btn-sm" onclick="editar('${id}')">Editar</button>
                <button class="btn btn-success btn-sm" onclick="abrirEntrada('${id}')">+Entrada</button>
                <button class="btn btn-danger btn-sm" onclick="abrirSaida('${id}')">-Saída</button>
                <button class="btn btn-info btn-sm" onclick="verAnalise('${id}')">📊</button>
                <button class="btn btn-dark btn-sm" onclick="imprimirEtiqueta('${id}')">🧾</button>
            </td>
        `;

        tabela.appendChild(tr);
    });
}

/* =========================
   EDITAR
========================= */

window.editar = function (id) {

    const p = produtosCache[id];

    if (!p) {
        console.error('Produto não encontrado no cache:', id);
        return;
    }

    modoAtual = 'cadastro';
    produtoAtualId = id;

    // 🔥 preencher campos com proteção
    document.getElementById('produto-id').value = id;

    document.getElementById('prod-codigo').value = p.codigoBarras || '';
    document.getElementById('prod-descricao').value = p.descricao || '';
    document.getElementById('prod-custo').value = p.valorCusto ?? 0;
    document.getElementById('prod-venda').value = p.valorVenda ?? 0;
    document.getElementById('prod-preco-atacado').value = p.precoAtacado ?? 0;
    document.getElementById('prod-qtd-min-atacado').value = p.quantidadeMinimaAtacado ?? 0;
    document.getElementById('prod-estoque').value = p.estoque ?? 0;

    // título modal
    document.getElementById('modal-title-estoque').textContent = 'Editar Produto';

    // mostrar formulário correto
    document.getElementById('modal-produto-form').style.display = 'block';
    document.getElementById('modal-movimento').style.display = 'none';

    btnConfirmar.textContent = 'Salvar Alterações';

    modal.show();
};

/* =========================
   BUSCA
========================= */

inputBusca.addEventListener('input', (e) => {

    const t = e.target.value.toLowerCase();

    if (t.length > 0 && t.length < 3) return;

    if (!t) return renderTabela(produtosCache);

    const filtrados = {};

    Object.entries(produtosCache).forEach(([id, p]) => {

        const d = (p.descricao || '').toLowerCase();
        const c = (p.codigoBarras || '').toLowerCase();

        if (d.includes(t) || c.includes(t)) {
            filtrados[id] = p;
        }
    });

    renderTabela(filtrados);
});

/* =========================
   LIMPAR FORM
========================= */

function limparFormulario() {
    $('produto-id').value = '';
    $('prod-codigo').value = '';
    $('prod-descricao').value = '';
    $('prod-custo').value = '';
    $('prod-venda').value = '';
    $('prod-preco-atacado').value = '';
    $('prod-qtd-min-atacado').value = '';
    $('prod-estoque').value = '0';
}

/* =========================
   📊 ANÁLISE (GRÁFICO)
========================= */

window.verAnalise = async function (id) {

    const historicoSnap = await get(ref(db, 'movimentacoesEstoque'));

    const dados = [];

    historicoSnap.forEach(child => {
        const m = child.val();

        if (m.produtoId === id) {
            dados.push(m);
        }
    });

    const ultimos = dados.slice(-10);

    const chartData = ultimos.map(m => ({
        tipo: m.tipo === 'entrada' ? 'Entrada' : 'Saída',
        quantidade: m.quantidade
    }));

    const container = document.createElement('div');

    container.innerHTML = `
        <div class="modal fade show d-block bg-dark bg-opacity-50">
            <div class="modal-dialog">
                <div class="modal-content p-3">
                    <h5>📊 Últimas Movimentações</h5>
                    <div id="chart"></div>
                    <button class="btn btn-secondary mt-2" onclick="this.closest('.modal').remove()">Fechar</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(container);

    // Chart simples (sem lib externa)
    document.getElementById('chart').innerHTML =
        ultimos.map(m =>
            `<div>${m.tipo}: ${m.quantidade}</div>`
        ).join('');
};

/* =========================
   🧾 ETIQUETA DE IMPRESSÃO
========================= */

window.imprimirEtiqueta = function (id) {

    const produto = produtosCache[id];

    const modal = new bootstrap.Modal(document.getElementById('modalImpressao'));
    const select = document.getElementById('tamanhoImpressao');
    const preview = document.getElementById('previewEtiqueta');
    const btn = document.getElementById('btnImprimirEtiqueta');

    function gerarPreview() {
        const tipo = select.value;

        let html = '';

        if (tipo === 'pequeno') {
            html = `
                <h3>${produto.descricao}</h3>
                <h1>R$ ${produto.valorVenda}</h1>
            `;
        }

        else if (tipo === 'medio') {
            html = `
                <h3>${produto.descricao}</h3>
                <h1>R$ ${produto.valorVenda}</h1>
            `;
        }

        else if (tipo === 'grande') {
            html = `
                <h1>OFERTA</h1>
                <h2>${produto.descricao}</h2>
                <h3>R$ ${produto.valorVenda}</h3>
                <span>UNIDADE</span>
            `;
        }

        preview.innerHTML = html;
    }

    select.onchange = gerarPreview;

    gerarPreview();

    btn.onclick = function () {
        Etiqueta(produto, select.value);
    };

    modal.show();
};

window.verAnalise = async function (produtoId) {

    const movSnap = await get(ref(db, 'movimentacoesEstoque'));
    const vendasSnap = await get(ref(db, 'vendas'));

    let entrada = 0;
    let saida = 0;
    let venda = 0;

    movSnap.forEach(child => {
        const m = child.val();

        if (m.produtoId !== produtoId) return;

        const tipo = (m.tipo || '').toLowerCase();
        const qtd = Number(m.quantidade || 0);

        if (tipo === 'entrada') entrada += qtd;
        if (tipo === 'saida') saida += qtd;
    });

    vendasSnap.forEach(child => {
    const v = child.val();

    if (!v.itens) return;

    v.itens.forEach(item => {

        const idItem =
            item.idProduto ||
            item.produtoId ||
            item.id;

        if (idItem === produtoId) {
            venda += Number(item.quantidade || 0);
        }
    });
});

    const idCanvas = 'chart_' + Date.now();

    const container = document.createElement('div');

    container.innerHTML = `
        <div class="modal fade show d-block bg-dark bg-opacity-50">
            <div class="modal-dialog modal-lg">
                <div class="modal-content p-3">

                    <h5>📊 Análise do Produto</h5>

                    <canvas id="${idCanvas}" height="120"></canvas>

                    <button class="btn btn-secondary mt-3"
                        onclick="this.closest('.modal').remove()">
                        Fechar
                    </button>

                </div>
            </div>
        </div>
    `;

    document.body.appendChild(container);

    const ctx = document.getElementById(idCanvas);

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Entrada', 'Saída', 'Venda'],
            datasets: [{
                label: 'Quantidade',
                data: [entrada, saida, venda],
                backgroundColor: [
                    'green',
                    'red',
                    'blue'
                ]
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
};

function renderGrafico(entrada, saida, venda) {

    return `
        ${JSON.stringify({
            chartType: "bar",
            meta: {
                title: "Movimentação do Produto",
                description: "Entrada vs Saída vs Vendas reais"
            },
            xKey: "tipo",
            series: [
                {
                    dataKey: "total",
                    label: "Quantidade",
                    valueFormat: "integer"
                }
            ],
            data: [
                { tipo: "Entrada", total: entrada },
                { tipo: "Saída", total: saida },
                { tipo: "Venda", total: venda }
            ]
        })}
    `;
}

/* =========================
   INIT
========================= */

carregarProdutos();

window.abrirEntrada = abrirEntrada;
window.abrirSaida = abrirSaida;
window.editar = editar;
window.verAnalise = verAnalise;
window.imprimirEtiqueta = imprimirEtiqueta;
