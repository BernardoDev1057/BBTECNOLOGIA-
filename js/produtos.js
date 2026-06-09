import { db, auth, ref, push, set, get, update } from './firebase-config.js';

const formProduto = document.getElementById('form-produto');
const formEstoque = document.getElementById('form-estoque');
const tabelaProdutos = document.getElementById('tabela-produtos-body');
const selectProdutosMov = document.getElementById('mov-produto-id');

formProduto.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('produto-id').value;
    const estoqueInicial = parseFloat(document.getElementById('estoqueInicial').value) || 0;

    const produtoData = {
        codigoBarras: document.getElementById('codigoBarras').value,
        descricao: document.getElementById('descricao').value,
        valorCusto: parseFloat(document.getElementById('valorCusto').value),
        valorVenda: parseFloat(document.getElementById('valorVenda').value),
    };

    if (id) {
        await update(ref(db, `produtos/${id}`), produtoData);
    } else {
        produtoData.estoque = estoqueInicial;
        const novoProdRef = push(ref(db, 'produtos'));
        await set(novoProdRef, produtoData);
        
        if(estoqueInicial > 0) {
            await registrarLogEstoque(novoProdRef.key, estoqueInicial, "Entrada", "Carga Inicial de Inventário");
        }
    }

    formProduto.reset();
    document.getElementById('produto-id').value = '';
    document.getElementById('estoqueInicial').disabled = false;
    inicializarTelaProdutos();
});

formEstoque.addEventListener('submit', async (e) => {
    e.preventDefault();
    const prodId = selectProdutosMov.value;
    const tipo = document.getElementById('mov-tipo').value;
    const qtd = parseFloat(document.getElementById('mov-qtd').value);
    const motivo = document.getElementById('mov-motivo').value;

    const prodSnap = await get(ref(db, `produtos/${prodId}`));
    if (!prodSnap.exists()) return;

    let estoqueAtual = prodSnap.val().estoque || 0;
    let novoEstoque = estoqueAtual;

    if (tipo === 'Entrada') novoEstoque += qtd;
    else if (tipo === 'Saída' || tipo === 'Perda') novoEstoque -= qtd;
    else if (tipo === 'Ajuste') novoEstoque = qtd;

    await update(ref(db, `produtos/${prodId}`), { estoque: novoEstoque });
    await registrarLogEstoque(prodId, qtd, tipo, motivo);

    formEstoque.reset();
    inicializarTelaProdutos();
});

async function registrarLogEstoque(produtoId, quantidade, tipo, motivo) {
    const usuarioAtual = auth.currentUser ? auth.currentUser.email : "Sistema_Automático";
    await set(push(ref(db, 'movimentacoesEstoque')), {
        produtoId,
        quantidade,
        tipo,
        motivo,
        dataHora: new Date().toISOString(),
        usuario: usuarioAtual
    });
}

async function inicializarTelaProdutos() {
    tabelaProdutos.innerHTML = '';
    selectProdutosMov.innerHTML = '<option value="">Selecione o Produto...</option>';

    const snapshot = await get(ref(db, 'produtos'));
    if (snapshot.exists()) {
        const produtos = snapshot.val();
        for (let id in produtos) {
            const p = produtos[id];
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${p.codigoBarras}</td>
                <td>${p.descricao}</td>
                <td><strong>${p.estoque}</strong></td>
                <td>R$ ${p.valorVenda.toFixed(2)}</td>
                <td><button class="btn-edit-prod" data-id="${id}">Editar</button></td>
            `;
            tabelaProdutos.appendChild(tr);

            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = p.descricao;
            selectProdutosMov.appendChild(opt);
        }

        document.querySelectorAll('.btn-edit-prod').forEach(btn => {
            btn.addEventListener('click', () => editarProduto(btn.getAttribute('data-id')));
        });
    }
}

async function editarProduto(id) {
    const snapshot = await get(ref(db, `produtos/${id}`));
    if (snapshot.exists()) {
        const p = snapshot.val();
        document.getElementById('produto-id').value = id;
        document.getElementById('codigoBarras').value = p.codigoBarras;
        document.getElementById('descricao').value = p.descricao;
        document.getElementById('valorCusto').value = p.valorCusto;
        document.getElementById('valorVenda').value = p.valorVenda;
        document.getElementById('estoqueInicial').disabled = true; 
    }
}

inicializarTelaProdutos();

