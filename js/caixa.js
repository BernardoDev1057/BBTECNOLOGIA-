import { db, auth, ref, push, set, get, update } from './firebase-config.js';
import { dispararMensagemWhatsApp } from './whatsapp.js'; // <-- Adicione esta linha no topo

// Estados de Controle Globais do Turno
let caixaAtivoId = null;
let valorInicialTroco = 0;
let carrinho = [];
let totalVendaGlobal = 0;

// Referência rápida de elementos mapeados da árvore HTML
const telaAbertura = document.getElementById('tela-abertura');
const telaPdv = document.getElementById('tela-pdv');
const navBtnSangria = document.getElementById('nav-btn-sangria');
const navBtnFechar = document.getElementById('nav-btn-fechar');

// Dados locais pré-carregados para buscas ultra-rápidas sem latência
let listaProdutosMemoria = {};
let listaClientesMemoria = {};
let produtoSelecionadoId = null;

// ==========================================
// 1. GERENCIAMENTO DE ESTADO E FLUXO DO CAIXA
// ==========================================
async function verificarFluxoCaixa() {
    if (!auth.currentUser) return;

    const snapshot = await get(ref(db, 'caixas'));
    let caixaAberto = false;

    if (snapshot.exists()) {
        for (let id in snapshot.val()) {
            const cx = snapshot.val()[id];
            if (cx.operador === auth.currentUser.email && cx.status === 'Aberto') {
                caixaAberto = true;
                caixaAtivoId = id;
                valorInicialTroco = cx.valorInicial || 0;
                break;
            }
        }
    }

    if (caixaAberto) {
        // Redirecionamento Visual Direto para o PDV
        telaAbertura.style.display = 'none';
        telaPdv.style.display = 'grid';
        navBtnSangria.style.display = 'inline-block';
        navBtnFechar.style.display = 'inline-block';
        carregarDadosParaBusca();
    } else {
        // Trava de tela: Exige a abertura
        telaAbertura.style.display = 'block';
        telaPdv.style.display = 'none';
        navBtnSangria.style.display = 'none';
        navBtnFechar.style.display = 'none';
    }
}

// Botão: Abrir Turno
document.getElementById('btn-confirmar-abertura').addEventListener('click', async () => {
    const troco = parseFloat(document.getElementById('caixa-troco-inicial').value) || 0;
    
    await set(push(ref(db, 'caixas')), {
        operador: auth.currentUser.email,
        dataHoraAbertura: new Date().toISOString(),
        valorInicial: troco,
        status: 'Aberto'
    });

    alert("Caixa iniciado com sucesso! Boas vendas.");
    verificarFluxoCaixa();
});

// Modais - Controle de Exibição
navBtnSangria.addEventListener('click', () => document.getElementById('modal-sangria').style.display = 'flex');
navBtnFechar.addEventListener('click', async () => {
    document.getElementById('modal-fechamento').style.display = 'flex';
    
    // Calcula em tempo real o valor estimado esperado
    let totalSuprimentos = 0, totalSangrias = 0, totalDinheiroVendas = 0;
    
    const sup = await get(ref(db, 'suprimentos'));
    if(sup.exists()) Object.values(sup.val()).forEach(s => { if(s.caixaId === caixaAtivoId) totalSuprimentos += s.valor; });

    const san = await get(ref(db, 'sangrias'));
    if(san.exists()) Object.values(san.val()).forEach(s => { if(s.caixaId === caixaAtivoId) totalSangrias += s.valor; });

    const ven = await get(ref(db, 'vendas'));
    if(ven.exists()) Object.values(ven.val()).forEach(v => { if(v.caixaId === caixaAtivoId && v.formaPagamento === 'Dinheiro') totalDinheiroVendas += v.total; });

    document.getElementById('txt-valor-esperado').textContent = (valorInicialTroco + totalDinheiroVendas + totalSuprimentos - totalSangrias).toFixed(2);
});

// Registrar Sangria / Suprimento
document.getElementById('btn-salvar-mov-caixa').addEventListener('click', async () => {
    const tipo = document.getElementById('modal-mov-tipo').value;
    const valor = parseFloat(document.getElementById('modal-mov-valor').value);
    const justificativa = document.getElementById('modal-mov-justificativa').value;

    if(isNaN(valor) || !justificativa) return alert("Preencha todos os campos da movimentação!");

    const destino = tipo === 'Suprimento' ? 'suprimentos' : 'sangrias';
    await set(push(ref(db, destino)), {
        caixaId: caixaAtivoId,
        valor,
        justificativa,
        usuario: auth.currentUser.email,
        dataHora: new Date().toISOString()
    });

    alert(`${tipo} lançado com sucesso!`);
    window.fecharModais();
});

// Confirmar Encerramento de Caixa
document.getElementById('btn-confirmar-fechamento').addEventListener('click', async () => {
    const valorContado = parseFloat(document.getElementById('caixa-valor-contado').value);
    if(isNaN(valorContado)) return alert("Digite o valor apurado fisicamente!");

    const valorEsperado = parseFloat(document.getElementById('txt-valor-esperado').textContent);

    await update(ref(db, `caixas/${caixaAtivoId}`), {
        status: 'Fechado',
        dataHoraFechamento: new Date().toISOString(),
        valorEsperado,
        valorContado,
        diferenca: valorContado - valorEsperado,
        justificativaDiferenca: document.getElementById('caixa-justificativa-dif').value || ""
    });

    alert("Turno encerrado!");
    window.location.reload();
});


// ==========================================
// 2. SISTEMA DE BUSCA AVANÇADA (PRODUTO/CLIENTE)
// ==========================================
async function carregarDadosParaBusca() {
    const prodSnap = await get(ref(db, 'produtos'));
    if(prodSnap.exists()) listaProdutosMemoria = prodSnap.val();

    const cliSnap = await get(ref(db, 'clientes'));
    if(cliSnap.exists()) listaClientesMemoria = cliSnap.val();
}

// Input de busca de produtos (Filtra por nome ou código)
document.getElementById('pdv-busca-produto').addEventListener('input', (e) => {
    const termo = e.target.value.toLowerCase().trim();
    const divResultados = document.getElementById('lista-busca-produto');
    divResultados.innerHTML = '';

    if (!termo) { divResultados.style.display = 'none'; return; }

    let filtrados = 0;
    Object.entries(listaProdutosMemoria).forEach(([id, p]) => {
        if (p.descricao.toLowerCase().includes(termo) || p.codigoBarras.includes(termo)) {
            if(filtrados++ > 5) return; // Limita visualização para velocidade
            const item = document.createElement('div');
            item.className = 'busca-item';
            item.textContent = `${p.codigoBarras} - ${p.descricao} (Estoque: ${p.estoque})`;
            item.addEventListener('click', () => {
                document.getElementById('pdv-busca-produto').value = p.descricao;
                produtoSelecionadoId = id;
                divResultados.style.display = 'none';
            });
            divResultados.appendChild(item);
        }
    });

    divResultados.style.display = filtrados > 0 ? 'block' : 'none';
});

// Input de busca de clientes
document.getElementById('pdv-busca-cliente').addEventListener('input', (e) => {
    const termo = e.target.value.toLowerCase().trim();
    const divResultados = document.getElementById('lista-busca-cliente');
    divResultados.innerHTML = '';

    if(!termo) { divResultados.style.display = 'none'; return; }

    let filtrados = 0;
    Object.entries(listaClientesMemoria).forEach(([id, c]) => {
        const doc = c.documento || "";
        if (c.nome.toLowerCase().includes(termo) || doc.includes(termo)) {
            if(filtrados++ > 5) return;
            const item = document.createElement('div');
            item.className = 'busca-item';
            item.textContent = `${c.nome} - Dívida: R$ ${(c.saldoDevedor || 0).toFixed(2)}`;
            item.addEventListener('click', () => {
                document.getElementById('pdv-busca-cliente').value = c.nome;
                document.getElementById('pdv-cliente-id-selecionado').value = id;
                divResultados.style.display = 'none';
            });
            divResultados.appendChild(item);
        }
    });
    divResultados.style.display = filtrados > 0 ? 'block' : 'none';
});


// ==========================================
// 3. MOTOR DO CARRINHO E VENDA (PDV)
// ==========================================
document.getElementById('btn-adicionar-item').addEventListener('click', () => {
    const qtd = parseFloat(document.getElementById('pdv-qtd').value) || 1;

    // Se o operador usou a caixa de busca e clicou no produto
    if (produtoSelecionadoId && listaProdutosMemoria[produtoSelecionadoId]) {
        inserirNoCarrinho(produtoSelecionadoId, listaProdutosMemoria[produtoSelecionadoId], qtd);
    } else {
        // Se ele apenas bipou o código direto no input e apertou o botão sem selecionar na lista
        const textoInput = document.getElementById('pdv-busca-produto').value.trim();
        let achadoId = null;
        Object.entries(listaProdutosMemoria).forEach(([id, p]) => {
            if(p.codigoBarras === textoInput) achadoId = id;
        });

        if(achadoId) {
            inserirNoCarrinho(achadoId, listaProdutosMemoria[achadoId], qtd);
        } else {
            alert("Produto não selecionado ou código de barras inválido!");
        }
    }
});

function inserirNoCarrinho(id, itemDados, qtd) {
    let precoAplicado = itemDados.valorVenda;
    
    // Regra Automática de Venda por Atacado
    if(itemDados.quantidadeMinimaAtacado && qtd >= itemDados.quantidadeMinimaAtacado) {
        precoAplicado = itemDados.precoAtacado || itemDados.valorVenda;
    }

    carrinho.push({
        id: id,
        descricao: itemDados.descricao,
        quantidade: qtd,
        precoUnitario: precoAplicado,
        subtotal: precoAplicado * qtd
    });

    // Reset dos campos de entrada
    document.getElementById('pdv-busca-produto').value = '';
    document.getElementById('pdv-qtd').value = 1;
    produtoSelecionadoId = null;

    renderizarCarrinhoHTML();
}

function renderizarCarrinhoHTML() {
    const tbody = document.getElementById('tabela-carrinho').querySelector('tbody');
    tbody.innerHTML = '';
    totalVendaGlobal = 0;

    carrinho.forEach((item, index) => {
        totalVendaGlobal += item.subtotal;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td>${item.descricao}</td>
            <td>${item.quantidade}</td>
            <td>R$ ${item.precoUnitario.toFixed(2)}</td>
            <td>R$ ${item.subtotal.toFixed(2)}</td>
            <td><button class="btn-danger" style="padding:2px 8px;" onclick="window.removerItemCarrinho(${index})">X</button></td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('pdv-total-venda').textContent = totalVendaGlobal.toFixed(2);
}

// Exposto globalmente para o botão remover funcionar
window.removerItemCarrinho = (index) => {
    carrinho.splice(index, 1);
    renderizarCarrinhoHTML();
};

// Fechamento de Cupom
document.getElementById('btn-finalizar-venda').addEventListener('click', async () => {
    if(carrinho.length === 0) return alert("Carrinho vazio!");
    
    const clienteId = document.getElementById('pdv-cliente-id-selecionado').value;
    const formaPagamento = document.getElementById('pdv-forma-pagamento').value;

    if (formaPagamento === 'CREDITO_LOJA') {
        if(!clienteId) return alert("Venda fiada rejeitada: Selecione um cliente!");
        
        const cliSnap = await get(ref(db, `clientes/${clienteId}`));
        const cli = cliSnap.val();
        const dividaFinal = (cli.saldoDevedor || 0) + totalVendaGlobal;

        if(dividaFinal > cli.limiteCredito) {
            return alert(`BLOQUEADO: Compra excede o limite do cliente (Limite: R$ ${cli.limiteCredito.toFixed(2)})`);
        }

        await update(ref(db, `clientes/${clienteId}`), { saldoDevedor: dividaFinal });
        await set(push(ref(db, 'contasReceber')), {
            clienteId, valor: totalVendaGlobal, status: 'Aberto', dataLancamento: new Date().toISOString()
        });
    }

    // Abate o estoque no Firebase
    for (let item of carrinho) {
        const pSnap = await get(ref(db, `produtos/${item.id}`));
        if(pSnap.exists()) {
            await update(ref(db, `produtos/${item.id}`), { estoque: (pSnap.val().estoque || 0) - item.quantidade });
        }
    }

    // Grava a Venda
    await set(push(ref(db, 'vendas')), {
        caixaId: caixaAtivoId,
        operador: auth.currentUser.email,
        items: carrinho,
        total: totalVendaGlobal,
        formaPagamento,
        dataHora: new Date().toISOString()
    });

// --- NOVA FUNCIONALIDADE: DISPARO DO CUPOM VIA WHATSAPP ---
    if (clienteId && listaClientesMemoria[clienteId]) {
        const dadosCliente = listaClientesMemoria[clienteId];
        
        const querEnviar = confirm(`Venda salva! Deseja enviar o Cupom Digital para o WhatsApp de ${dadosCliente.nome}?`);
        
        if (querEnviar) {
            // Monta o corpo de texto do cupom formatado de forma legível
            let cupomTexto = `🛍️ *CUPOM FISCAL DIGITAL - Distribuidora*\n`;
            cupomTexto += `----------------------------------------\n`;
            cupomTexto += `📅 Data: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}\n`;
            cupomTexto += `👤 Cliente: ${dadosCliente.nome}\n`;
            cupomTexto += `💳 Pagamento: ${formaPagamento}\n`;
            cupomTexto += `----------------------------------------\n`;
            cupomTexto += `*ITENS DO PEDIDO:*\n`;
            
            carrinho.forEach((item, index) => {
                cupomTexto += `${index + 1}. ${item.descricao} x${item.quantidade} - R$ ${item.subtotal.toFixed(2)}\n`;
            });
            
            cupomTexto += `----------------------------------------\n`;
            cupomTexto += `💰 *TOTAL A PAGAR: R$ ${totalVendaGlobal.toFixed(2)}*\n\n`;
            cupomTexto += `Obrigado pela preferência! Volte sempre. 😊`;

            // Chama o motor de envio
            dispararMensagemWhatsApp(dadosCliente.telefone, cupomTexto);
        }
    } else {
        alert("Venda concluída com sucesso (Consumidor não identificado)!");
    }


    carrinho = [];
    document.getElementById('pdv-busca-cliente').value = '';
    document.getElementById('pdv-cliente-id-selecionado').value = '';
    renderizarCarrinhoHTML();
    carregarDadosParaBusca(); // Atualiza saldos em cache
});

// Disparo Inicial por Pooling seguro do Firebase Auth
setTimeout(verificarFluxoCaixa, 1500);

