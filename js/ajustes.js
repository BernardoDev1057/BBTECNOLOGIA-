import { db, ref, get, update } from './firebase-config.js';

const tabela = document.getElementById('tabela-ajustes');
const inputBusca = document.getElementById('busca-ajuste');
let produtosCache = {};

async function carregarAjustes() {
    const snap = await get(ref(db, 'produtos'));
    if (!snap.exists()) {
        tabela.innerHTML = '<tr><td colspan="6" class="text-center">Nenhum produto encontrado.</td></tr>';
        return;
    }
    produtosCache = snap.val();
    renderizarTabela(produtosCache);
}

function calcularMargem(custo, venda) {
    return venda > 0? ((venda - custo) / venda) * 100 : 0;
}

function corMargem(margem) {
    if (margem >= 30) return 'bg-success';
    if (margem >= 20) return 'bg-warning text-dark';
    return 'bg-danger';
}

function renderizarTabela(produtos) {
    tabela.innerHTML = '';
    Object.entries(produtos).forEach(([id, p]) => {
        const custo = p.valorCusto || 0;
        const venda = p.valorVenda || 0;
        const margem = calcularMargem(custo, venda);

        const tr = document.createElement('tr');
        tr.dataset.id = id;
        tr.innerHTML = `
            <td>${p.descricao}<br><small class="text-muted">${p.codigoBarras}</small></td>
            <td><input type="number" step="0.01" class="form-control form-control-sm edit-custo" value="${custo.toFixed(2)}" style="width: 100px;"></td>
            <td><input type="number" step="0.01" class="form-control form-control-sm edit-venda" value="${venda.toFixed(2)}" style="width: 100px;"></td>
            <td><span class="badge ${corMargem(margem)} margem-badge">${margem.toFixed(1)}%</span></td>
            <td><button class="btn btn-sm btn-primary btn-salvar">Salvar</button></td>
        `;
        tabela.appendChild(tr);
    });
}

// Calculo em tempo real
tabela.addEventListener('input', (e) => {
    if (e.target.classList.contains('edit-custo') || e.target.classList.contains('edit-venda')) {
        const tr = e.target.closest('tr');
        const custo = parseFloat(tr.querySelector('.edit-custo').value) || 0;
        const venda = parseFloat(tr.querySelector('.edit-venda').value) || 0;
        const margem = calcularMargem(custo, venda);

        const badge = tr.querySelector('.margem-badge');
        badge.textContent = margem.toFixed(1) + '%';
        badge.className = 'badge margem-badge ' + corMargem(margem);
    }
});

// Salvar no Firebase
tabela.addEventListener('click', async (e) => {
    if (e.target.classList.contains('btn-salvar')) {
        const tr = e.target.closest('tr');
        const id = tr.dataset.id;
        const novoCusto = parseFloat(tr.querySelector('.edit-custo').value);
        const novoPreco = parseFloat(tr.querySelector('.edit-venda').value);

        if (confirm("Confirmar alteração de custo e preço?")) {
            await update(ref(db, `produtos/${id}`), {
                valorCusto: novoCusto,
                valorVenda: novoPreco
            });
            alert("Dados atualizados!");
            produtosCache[id].valorCusto = novoCusto;
            produtosCache[id].valorVenda = novoPreco;
        }
    }
});

// Busca só depois de 3 caracteres
inputBusca.addEventListener('input', (e) => {
    const termo = e.target.value.toLowerCase().trim();
    const linhas = tabela.querySelectorAll('tr');

    if (termo.length < 3 && termo.length > 0) return;

    linhas.forEach(tr => {
        if (termo.length === 0) {
            tr.style.display = '';
        } else {
            tr.style.display = tr.innerText.toLowerCase().includes(termo)? '' : 'none';
        }
    });
});

carregarAjustes();
