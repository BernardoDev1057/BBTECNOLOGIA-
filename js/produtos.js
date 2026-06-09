import { db, auth, ref, push, set, get, update } from './firebase-config.js';

const formProduto = document.getElementById('form-produto');

// Evento de salvamento / Edição do Produto
formProduto.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('produto-id').value;
    const estoqueInicial = parseFloat(document.getElementById('prod-estoque').value) || 0;

    // Mapeamento corrigido com os IDs exatos do seu produtos.html
    const produtoData = {
        codigoBarras: document.getElementById('prod-codigo').value,
        descricao: document.getElementById('prod-descricao').value,
        valorCusto: parseFloat(document.getElementById('prod-custo').value) || 0,
        valorVenda: parseFloat(document.getElementById('prod-venda').value) || 0,
        valorAtacado: parseFloat(document.getElementById('prod-atacado').value) || 0,
        qtdAtacado: parseInt(document.getElementById('prod-qtd-atacado').value) || 0
    };

    if (id) {
        // Na edição, não sobrescrevemos o estoque por aqui para evitar furos de inventário
        await update(ref(db, 'produtos/' + id), {
            codigoBarras: produtoData.codigoBarras,
            descricao: produtoData.descricao,
            valorCusto: produtoData.valorCusto,
            valorVenda: produtoData.valorVenda,
            valorAtacado: produtoData.valorAtacado,
            qtdAtacado: produtoData.qtdAtacado
        });
    } else {
        // Produto novo: define o estoque inicial físico
        produtoData.estoque = estoqueInicial;
        const novoProdRef = push(ref(db, 'produtos'));
        await set(novoProdRef, produtoData);

        if (estoqueInicial > 0) {
            await registrarLogEstoque(novoProdRef.key, estoqueInicial, 'Entrada', 'Carga Inicial de Inventário');
        }
    }

    formProduto.reset();
    document.getElementById('produto-id').value = '';
    
    // Libera os campos de estoque para novos cadastros
    document.getElementById('prod-estoque').disabled = false;
    document.getElementById('label-estoque-inicial').style.display = 'block';
    document.getElementById('prod-estoque').style.display = 'block';
    
    inicializarTelaProdutos();
});

// Registra movimentações no histórico para auditoria
async function registrarLogEstoque(produtoId, quantidade, tipo, motivo) {
    const usuarioAtual = auth.currentUser ? auth.currentUser.email : 'Sistema_Automático';
    await set(push(ref(db, 'movimentacoesEstoque')), {
        produtoId: produtoId,
        quantidade: quantidade,
        tipo: tipo,
        motivo: motivo,
        dataHora: new Date().toISOString(),
        usuario: usuarioAtual
    });
}

// Carrega os dados do Firebase e renderiza a tabela
async function inicializarTelaProdutos() {
    const tabelaProdutos = document.getElementById('tabela-produtos');
    if (!tabelaProdutos) return;

    tabelaProdutos.innerHTML = '';

    const snapshot = await get(ref(db, 'produtos'));
    if (snapshot.exists()) {
        const produtos = snapshot.val();
        for (let id in produtos) {
            const p = produtos[id];
            const tr = document.createElement('tr');
            
            // Tratamento de segurança para valores numéricos nulos ou indefinidos
            const custo = p.valorCusto ? p.valorCusto : 0;
            const venda = p.valorVenda ? p.valorVenda : 0;
            const estoque = p.estoque ? p.estoque : 0;

            // Montagem da tabela livre de crases para evitar erros de token inesperados
            tr.innerHTML = '<td>' + p.codigoBarras + '</td>' +
                           '<td>' + p.descricao + '</td>' +
                           '<td>R$ ' + parseFloat(custo).toFixed(2) + '</td>' +
                           '<td>R$ ' + parseFloat(venda).toFixed(2) + '</td>' +
                           '<td><strong>' + estoque + '</strong></td>' +
                           '<td><button class="btn-edit-prod" data-id="' + id + '" style="padding: 4px 8px; cursor: pointer;">Editar</button></td>';
            
            tabelaProdutos.appendChild(tr);
        }

        // Atribui evento de clique nos botões dinâmicos de Edição
        document.querySelectorAll('.btn-edit-prod').forEach(btn => {
            btn.addEventListener('click', () => editarProduto(btn.getAttribute('data-id')));
        });
    } else {
        tabelaProdutos.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#999;">Nenhum produto cadastrado.</td></tr>';
    }
}

// Resgata os dados da mercadoria e joga no formulário
async function editarProduto(id) {
    const snapshot = await get(ref(db, 'produtos/' + id));
    if (snapshot.exists()) {
        const p = snapshot.val();
        
        document.getElementById('produto-id').value = id;
        document.getElementById('prod-codigo').value = p.codigoBarras;
        document.getElementById('prod-descricao').value = p.descricao;
        document.getElementById('prod-custo').value = p.valorCusto || '';
        document.getElementById('prod-venda').value = p.valorVenda || '';
        document.getElementById('prod-atacado').value = p.valorAtacado || '0.00';
        document.getElementById('prod-qtd-atacado').value = p.qtdAtacado || '0';
        
        // Esconde a opção de "Estoque Inicial" na edição para evitar fraudes gerenciais
        document.getElementById('prod-estoque').disabled = true;
        document.getElementById('label-estoque-inicial').style.display = 'none';
        document.getElementById('prod-estoque').style.display = 'none';
    }
}

// Inicializa a listagem ao abrir a página
inicializarTelaProdutos();

