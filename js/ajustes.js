import { db, ref, get, update } from './firebase-config.js';
import { $, parseFloatSafe, parseIntSafe } from './utils.js';

const tabela = $('tabela-ajustes');
const inputBusca = $('busca-ajuste');
let produtosCache = {};

async function carregarAjustes() {
    const snap = await get(ref(db, 'produtos'));
    if (!snap.exists()) {
        tabela.innerHTML = '<tr><td colspan="7" class="text-center">Nenhum produto encontrado.</td></tr>';
        return;
    }

    produtosCache = snap.val();
    renderizarTabela(produtosCache);
}

function calcularMargem(custo, venda) {
    return venda > 0 ? ((venda - custo) / venda) * 100 : 0;
}

function corMargem(margem) {
    if (margem >= 30) return 'bg-success';
    if (margem >= 20) return 'bg-warning text-dark';
    return 'bg-danger';
}

function gerarLinhaProduto(id, produto) {
    const custo = produto.valorCusto || 0;
    const venda = produto.valorVenda || 0;
    const atacado = produto.precoAtacado || 0;
    const qtdMin = produto.quantidadeMinimaAtacado || 0;
    const margem = calcularMargem(custo, venda);

    const tr = document.createElement('tr');
    tr.dataset.id = id;
    tr.dataset.descricao = (produto.descricao || '').toLowerCase();
    tr.dataset.codigo = (produto.codigoBarras || '').toLowerCase();

    tr.innerHTML = `
        <td>${produto.descricao || ''}<br><small class="text-muted">${produto.codigoBarras || ''}</small></td>
        <td><input type="number" step="0.01" class="form-control form-control-sm edit-custo" value="${custo.toFixed(2)}" style="width: 100px"></td>
        <td><input type="number" step="0.01" class="form-control form-control-sm edit-venda" value="${venda.toFixed(2)}" style="width: 100px"></td>
        <td><span class="badge ${corMargem(margem)} margem-badge">${margem.toFixed(1)}%</span></td>
        <td><input type="number" step="0.01" class="form-control form-control-sm edit-atacado" value="${atacado.toFixed(2)}" style="width: 100px"></td>
        <td><input type="number" step="1" min="0" class="form-control form-control-sm edit-qtd-min" value="${qtdMin}" style="width: 80px"></td>
        <td><button class="btn btn-sm btn-primary btn-salvar">Salvar</button></td>
    `;

    return tr;
}

function renderizarTabela(produtos) {
    tabela.innerHTML = '';
    Object.entries(produtos).forEach(([id, p]) => {
        tabela.appendChild(gerarLinhaProduto(id, p));
    });
}

function atualizarMargemLinha(tr) {
    const custo = parseFloatSafe(tr.querySelector('.edit-custo').value);
    const venda = parseFloatSafe(tr.querySelector('.edit-venda').value);
    const margem = calcularMargem(custo, venda);
    const badge = tr.querySelector('.margem-badge');

    if (badge) {
        badge.textContent = `${margem.toFixed(1)}%`;
        badge.className = `badge margem-badge ${corMargem(margem)}`;
    }
}

function atualizarProdutoCache(id, novoCusto, novoPreco, novoAtacado, novaQtdMin) {
    if (!produtosCache[id]) return;
    produtosCache[id].valorCusto = novoCusto;
    produtosCache[id].valorVenda = novoPreco;
    produtosCache[id].precoAtacado = novoAtacado;
    produtosCache[id].quantidadeMinimaAtacado = novaQtdMin;
}

function filtrarTabela(termo) {
    const linhas = tabela.querySelectorAll('tr');
    linhas.forEach(tr => {
        if (!termo) {
            tr.style.display = '';
            return;
        }

        const desc = tr.dataset.descricao || '';
        const cod = tr.dataset.codigo || '';
        tr.style.display = (desc.includes(termo) || cod.includes(termo)) ? '' : 'none';
    });
}

// Calculo em tempo real da margem
if (tabela) {
    tabela.addEventListener('input', (e) => {
        if (e.target.classList.contains('edit-custo') || e.target.classList.contains('edit-venda')) {
            const tr = e.target.closest('tr');
            if (tr) atualizarMargemLinha(tr);
        }
    });

    tabela.addEventListener('click', async (e) => {
        if (!e.target.classList.contains('btn-salvar')) return;

        const tr = e.target.closest('tr');
        if (!tr) return;

        const id = tr.dataset.id;
        const novoCusto = parseFloatSafe(tr.querySelector('.edit-custo').value);
        const novoPreco = parseFloatSafe(tr.querySelector('.edit-venda').value);
        const novoAtacado = parseFloatSafe(tr.querySelector('.edit-atacado').value);
        const novaQtdMin = parseIntSafe(tr.querySelector('.edit-qtd-min').value);

        await update(ref(db, `produtos/${id}`), {
            valorCusto: novoCusto,
            valorVenda: novoPreco,
            precoAtacado: novoAtacado,
            quantidadeMinimaAtacado: novaQtdMin
        });

        atualizarProdutoCache(id, novoCusto, novoPreco, novoAtacado, novaQtdMin);
        alert('Dados atualizados!');
    });
}

if (inputBusca) {
    inputBusca.addEventListener('input', (e) => {
        filtrarTabela(e.target.value.toLowerCase().trim());
    });
}

carregarAjustes();
