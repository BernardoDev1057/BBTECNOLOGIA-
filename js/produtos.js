import { db, auth, ref, push, set, get, update } from './firebase-config.js';
import { $, fmtMoney, parseFloatSafe, parseIntSafe } from './utils.js';

const formProduto = $('form-produto');
const btnCancelar = document.createElement('button');
btnCancelar.type = 'button';
btnCancelar.className = 'btn btn-secondary fw-bold ms-2';
btnCancelar.textContent = 'Cancelar Edição';
btnCancelar.style.display = 'none';
formProduto.querySelector('.col-12:last-child').appendChild(btnCancelar);

const inputBusca = document.createElement('input');
inputBusca.type = 'text';
inputBusca.id = 'busca-produto';
inputBusca.className = 'form-control mb-3';
inputBusca.placeholder = 'Filtrar por código ou descrição...';
document.querySelector('.card-body.p-0').prepend(inputBusca);

let produtosCache = {};

// Evento de salvamento / Edição do Produto
formProduto.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = $('produto-id').value;
    const estoqueInicial = parseFloatSafe($('prod-estoque').value);

    // PADRÃO ÚNICO: precoAtacado e quantidadeMinimaAtacado
    const produtoData = {
        codigoBarras: $('prod-codigo').value.trim(),
        descricao: $('prod-descricao').value.trim(),
        valorCusto: parseFloatSafe($('prod-custo').value),
        valorVenda: parseFloatSafe($('prod-venda').value),
        precoAtacado: parseFloatSafe($('prod-preco-atacado').value),
        quantidadeMinimaAtacado: parseIntSafe($('prod-qtd-min-atacado').value)
    };

    if (id) {
        // Edição: não mexe no estoque
        await update(ref(db, 'produtos/' + id), produtoData);
	window.mostrarAlertaSistema('Produto atualizado com sucesso!', 'Sucesso');
    } else {
        // Novo: define estoque inicial
        produtoData.estoque = estoqueInicial;
        const novoProdRef = push(ref(db, 'produtos'));
        await set(novoProdRef, produtoData);

        if (estoqueInicial > 0) {
            await registrarLogEstoque(novoProdRef.key, estoqueInicial, 'Entrada', 'Carga Inicial de Inventário');
        }
	window.mostrarAlertaSistema('Produto cadastrado com sucesso!', 'Sucesso');

    }

    resetarFormulario();
    inicializarTelaProdutos();
});

btnCancelar.addEventListener('click', resetarFormulario);

function resetarFormulario() {
    formProduto.reset();
    $('produto-id').value = '';
    $('prod-estoque').disabled = false;
    $('label-estoque-inicial').style.display = 'block';
    $('prod-estoque').style.display = 'block';
    btnCancelar.style.display = 'none';
    document.querySelector('button[type="submit"]').textContent = 'Gravar Produto';
}

async function registrarLogEstoque(produtoId, quantidade, tipo, motivo) {
    const usuarioAtual = auth.currentUser? auth.currentUser.email : 'Sistema_Automático';
    await set(push(ref(db, 'movimentacoesEstoque')), {
        produtoId: produtoId,
        quantidade: quantidade,
        tipo: tipo,
        motivo: motivo,
        dataHora: new Date().toISOString(),
        usuario: usuarioAtual
    });
}

async function inicializarTelaProdutos() {
    const tabelaProdutos = document.getElementById('tabela-produtos');
    if (!tabelaProdutos) return;

    tabelaProdutos.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">Carregando...</td></tr>';

    const snapshot = await get(ref(db, 'produtos'));
    if (snapshot.exists()) {
        produtosCache = snapshot.val();
        renderizarTabela(produtosCache);
    } else {
        tabelaProdutos.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#999;">Nenhum produto cadastrado.</td></tr>';
    }
}

function renderizarTabela(produtos) {
    const tabelaProdutos = document.getElementById('tabela-produtos');
    tabelaProdutos.innerHTML = '';

    Object.entries(produtos).forEach(([id, p]) => {
        const custo = p.valorCusto || 0;
        const venda = p.valorVenda || 0;
        const estoque = p.estoque || 0;
        const precoAtacado = p.precoAtacado || 0;
        const qtdMinAtacado = p.quantidadeMinimaAtacado || 0;
        const margem = venda > 0? ((venda - custo) / venda) * 100 : 0;
        const corMargem = margem >= 30? 'text-success' : margem >= 20? 'text-warning' : 'text-danger';

        const tr = document.createElement('tr');
        tr.dataset.id = id;
        tr.innerHTML = `
            <td>${p.codigoBarras || '---'}</td>
            <td>${p.descricao}</td>
            <td>R$ ${custo.toFixed(2)}</td>
            <td>R$ ${venda.toFixed(2)}</td>
            <td class="${corMargem} fw-bold">${margem.toFixed(1)}%</td>
            <td>R$ ${precoAtacado.toFixed(2)}</td>
            <td><strong>${estoque}</strong></td>
            <td>
                <button class="btn btn-sm btn-warning btn-edit-prod" data-id="${id}">Editar</button>
            </td>
        `;
        tabelaProdutos.appendChild(tr);
    });

    document.querySelectorAll('.btn-edit-prod').forEach(btn => {
        btn.addEventListener('click', () => editarProduto(btn.getAttribute('data-id')));
    });
}

inputBusca.addEventListener('input', (e) => {
    const termo = e.target.value.toLowerCase().trim();
    if (termo.length < 3 && termo.length > 0) return;

    if (termo.length === 0) {
        renderizarTabela(produtosCache);
    } else {
        const filtrados = {};
        Object.entries(produtosCache).forEach(([id, p]) => {
            if (p.descricao.toLowerCase().includes(termo) || p.codigoBarras.toLowerCase().includes(termo)) {
                filtrados[id] = p;
            }
        });
        renderizarTabela(filtrados);
    }
});

async function editarProduto(id) {
    const p = produtosCache[id];
    if (p) {
        document.getElementById('produto-id').value = id;
        document.getElementById('prod-codigo').value = p.codigoBarras;
        document.getElementById('prod-descricao').value = p.descricao;
        document.getElementById('prod-custo').value = p.valorCusto || '';
        document.getElementById('prod-venda').value = p.valorVenda || '';
        document.getElementById('prod-preco-atacado').value = p.precoAtacado || '0.00';
        document.getElementById('prod-qtd-min-atacado').value = p.quantidadeMinimaAtacado || '0';

        document.getElementById('prod-estoque').disabled = true;
        document.getElementById('label-estoque-inicial').style.display = 'none';
        document.getElementById('prod-estoque').style.display = 'none';
        btnCancelar.style.display = 'inline-block';
        document.querySelector('button[type="submit"]').textContent = 'Salvar Alterações';

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

inicializarTelaProdutos();
