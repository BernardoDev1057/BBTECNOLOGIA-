import { db, ref, get, update } from './firebase-config.js';

const tabela = document.getElementById('tabela-ajustes');
const inputBusca = document.getElementById('busca-ajuste');

async function carregarAjustes() {
    const snap = await get(ref(db, 'produtos'));
    if (!snap.exists()) {
        tabela.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum produto encontrado.</td></tr>';
        return;
    }

    const produtos = snap.val();
    renderizarTabela(produtos);
}

function renderizarTabela(produtos) {
    tabela.innerHTML = '';
    Object.entries(produtos).forEach(([id, p]) => {
        const custo = p.valorCusto || 0;
        const venda = p.valorVenda || 0;
        const margem = venda > 0 ? ((venda - custo) / venda) * 100 : 0;
        
        // Indicador visual: Vermelho (<20%), Amarelo (<30%), Verde (>=30%)
        let corClasse = 'bg-danger';
        if (margem >= 30) corClasse = 'bg-success';
        else if (margem >= 20) corClasse = 'bg-warning text-dark';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${p.descricao}<br><small class="text-muted">${p.codigoBarras}</small></td>
            <td>R$ ${custo.toFixed(2)}</td>
            <td><input type="number" class="form-control form-control-sm edit-venda" data-id="${id}" value="${venda.toFixed(2)}" style="width: 100px;"></td>
            <td><span class="badge ${corClasse}">${margem.toFixed(1)}%</span></td>
            <td><button class="btn btn-sm btn-primary btn-salvar" data-id="${id}">Salvar</button></td>
        `;
        tabela.appendChild(tr);
    });
}

// Salvar no Firebase
document.addEventListener('click', async (e) => {
    if (e.target.classList.contains('btn-salvar')) {
        const id = e.target.getAttribute('data-id');
        const novoPreco = parseFloat(e.target.closest('tr').querySelector('.edit-venda').value);
        
        if (confirm("Confirmar alteração de preço para este produto?")) {
            await update(ref(db, `produtos/${id}`), { valorVenda: novoPreco });
            alert("Preço atualizado com sucesso!");
            carregarAjustes();
        }
    }
});

// Busca simples
inputBusca.addEventListener('input', (e) => {
    const termo = e.target.value.toLowerCase();
    const linhas = tabela.querySelectorAll('tr');
    linhas.forEach(tr => {
        const texto = tr.innerText.toLowerCase();
        tr.style.display = texto.includes(termo) ? '' : 'none';
    });
});

carregarAjustes();
