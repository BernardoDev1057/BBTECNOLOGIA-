import { db, auth, ref, push, set, get, update } from './firebase-config.js';
import { dispararMensagemWhatsApp } from './whatsapp.js';
import { imprimirComprovante } from './impressora.js';

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
        telaAbertura.style.display = 'none';
        telaPdv.style.display = 'grid';
        navBtnSangria.style.display = 'inline-block';
        navBtnFechar.style.display = 'inline-block';
        if (window.toggleBarraCaixa) window.toggleBarraCaixa(true);
        carregarDadosParaBusca();
    } else {
        telaAbertura.style.display = 'block';
        telaPdv.style.display = 'none';
        navBtnSangria.style.display = 'none';
        navBtnFechar.style.display = 'none';
        if (window.toggleBarraCaixa) window.toggleBarraCaixa(false);
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
    imprimirComprovante("ABERTURA DE CAIXA", `<p>Operador: ${auth.currentUser.email}</p>`);
    window.mostrarAlertaSistema("Caixa iniciado com sucesso! Boas vendas.", "Frente de Caixa");
    verificarFluxoCaixa();
});

// Modais - Controle de Exibição
navBtnSangria.addEventListener('click', () => window.modalSangria.show());
navBtnFechar.addEventListener('click', async () => {
    window.modalFechamento.show();
    let totalSuprimentos = 0, totalSangrias = 0, totalDinheiroVendas = 0;
    
    const sup = await get(ref(db, 'suprimentos'));
    if(sup.exists()) Object.values(sup.val()).forEach(s => {
        if(s.caixaId === caixaAtivoId) totalSuprimentos += s.valor;
    });
    
    const san = await get(ref(db, 'sangrias'));
    if(san.exists()) Object.values(san.val()).forEach(s => {
        if(s.caixaId === caixaAtivoId) totalSangrias += s.valor;
    });
    
    const ven = await get(ref(db, 'vendas'));
    if(ven.exists()) Object.values(ven.val()).forEach(v => {
        if(v.caixaId === caixaAtivoId && v.formaPagamento === 'Dinheiro') totalDinheiroVendas += v.total;
    });
    
    document.getElementById('txt-valor-esperado').textContent = (valorInicialTroco + totalDinheiroVendas + totalSuprimentos - totalSangrias).toFixed(2);
});

// Registrar Sangria / Suprimento
document.getElementById('btn-salvar-mov-caixa').addEventListener('click', async () => {
    const tipo = document.getElementById('modal-mov-tipo').value;
    const valor = parseFloat(document.getElementById('modal-mov-valor').value);
    const justificativa = document.getElementById('modal-mov-justificativa').value;
    
    if(isNaN(valor) || !justificativa) {
        return window.mostrarAlertaSistema("Preencha todos os campos da movimentação!", "Validação");
    }
    
    const destino = tipo === 'Suprimento' ? 'suprimentos' : 'sangrias';
    await set(push(ref(db, destino)), {
        caixaId: caixaAtivoId,
        valor,
        justificativa,
        usuario: auth.currentUser.email,
        dataHora: new Date().toISOString()
    });
    
    const corpoMov = `
        <div style="font-size: 14px;">
            <p><strong>Tipo:</strong> ${tipo}</p>
            <p><strong>Valor:</strong> R$ ${valor.toFixed(2)}</p>
            <p><strong>Justificativa:</strong> ${justificativa}</p>
            <p><strong>Operador:</strong> ${auth.currentUser.email}</p>
        </div>
    `;
    imprimirComprovante(`COMPROVANTE DE ${tipo.toUpperCase()}`, corpoMov);
    window.mostrarAlertaSistema(`${tipo} lançado com sucesso!`, "Movimentação Efetuada");
    
    window.modalSangria.hide();
    document.getElementById('modal-mov-valor').value = '';
    document.getElementById('modal-mov-justificativa').value = '';
});

// Confirmar Encerramento de Caixa
document.getElementById('btn-confirmar-fechamento').addEventListener('click', async () => {
    const valorContado = parseFloat(document.getElementById('caixa-valor-contado').value);
    if(isNaN(valorContado)) return window.mostrarAlertaSistema("Digite o valor apurado fisicamente!", "Validação");
    
    const valorEsperado = parseFloat(document.getElementById('txt-valor-esperado').textContent);
    const diferenca = valorContado - valorEsperado;
    const dataFechamento = new Date().toISOString();
    
    await update(ref(db, `caixas/${caixaAtivoId}`), {
        status: 'Fechado',
        dataHoraFechamento: dataFechamento,
        valorEsperado,
        valorContado,
        diferenca: diferenca,
        justificativaDiferenca: document.getElementById('caixa-justificativa-dif').value || ""
    });
    
    const corpoRelatorio = `
        <div style="font-size: 13px;">
            <p><strong>Relatório de Fechamento</strong></p>
            <p>Operador: ${auth.currentUser.email}</p>
            <div class="linha"></div>
            <p><strong>Valor Esperado:</strong> R$ ${valorEsperado.toFixed(2)}</p>
            <p><strong>Valor Contado:</strong> R$ ${valorContado.toFixed(2)}</p>
            <div class="linha"></div>
            <p><strong>Diferença:</strong> R$ ${diferenca.toFixed(2)}</p>
            <p><strong>Obs:</strong> ${document.getElementById('caixa-justificativa-dif').value || 'Nenhuma'}</p>
        </div>
    `;
    imprimirComprovante("FECHAMENTO DE CAIXA", corpoRelatorio);
    window.mostrarAlertaSistema("Turno encerrado e relatório impresso!", "Caixa Fechado");
    
    window.modalFechamento.hide();
    setTimeout(() => {
        window.location.reload();
    }, 1000);
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

// Busca de produtos
document.getElementById('pdv-busca-produto').addEventListener('input', (e) => {
    const termo = e.target.value.toLowerCase().trim();
    const divResultados = document.getElementById('lista-busca-produto');
    divResultados.innerHTML = '';
    
    if (!termo) {
        divResultados.style.display = 'none';
        return;
    }
    
    let filtrados = 0;
    Object.entries(listaProdutosMemoria).forEach(([id, p]) => {
        if (p.descricao.toLowerCase().includes(termo) || p.codigoBarras.includes(termo)) {
            if(filtrados++ > 5) return;
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

// Busca de clientes
document.getElementById('pdv-busca-cliente').addEventListener('input', (e) => {
    const termo = e.target.value.toLowerCase().trim();
    const divResultados = document.getElementById('lista-busca-cliente');
    divResultados.innerHTML = '';
    
    if(!termo) {
        divResultados.style.display = 'none';
        return;
    }
    
    let filtrados = 0;
    Object.entries(listaClientesMemoria).forEach(([id, c]) => {
        const doc = c.cpf || "";
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
    if (produtoSelecionadoId && listaProdutosMemoria[produtoSelecionadoId]) {
        inserirNoCarrinho(produtoSelecionadoId, listaProdutosMemoria[produtoSelecionadoId], qtd);
    } else {
        const textoInput = document.getElementById('pdv-busca-produto').value.trim();
        let achadoId = null;
        Object.entries(listaProdutosMemoria).forEach(([id, p]) => {
            if(p.codigoBarras === textoInput) achadoId = id;
        });
        if(achadoId) {
            inserirNoCarrinho(achadoId, listaProdutosMemoria[achadoId], qtd);
        } else {
            window.mostrarAlertaSistema("Produto não selecionado ou código de barras inválido!", "Atenção");
        }
    }
});

function inserirNoCarrinho(id, itemDados, qtd) {
    let precoAplicado = itemDados.valorVenda;
    // REGRA ATACADO - PADRÃO ÚNICO: precoAtacado / quantidadeMinimaAtacado
    if(itemDados.quantidadeMinimaAtacado && qtd >= itemDados.quantidadeMinimaAtacado && itemDados.precoAtacado > 0) {
        precoAplicado = itemDados.precoAtacado;
    }
    carrinho.push({
        id: id,
        descricao: itemDados.descricao,
        quantidade: qtd,
        precoUnitario: precoAplicado,
        subtotal: precoAplicado * qtd
    });
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
            <td><button class="btn btn-sm btn-danger" onclick="window.removerItemCarrinho(${index})">X</button></td>
        `;
        tbody.appendChild(tr);
    });
    document.getElementById('pdv-total-venda').textContent = totalVendaGlobal.toFixed(2);
}

// Vincula explicitamente a função ao escopo global (window) antes de ser invocada pela árvore DOM
window.removerItemCarrinho = (index) => {
    carrinho.splice(index, 1);
    renderizarCarrinhoHTML();
};

// Fechamento de Cupom
document.getElementById('btn-finalizar-venda').addEventListener('click', async () => {
    if(carrinho.length === 0) return window.mostrarAlertaSistema("Carrinho vazio!", "Aviso");
    const clienteId = document.getElementById('pdv-cliente-id-selecionado').value;
    const formaPagamento = document.getElementById('pdv-forma-pagamento').value;
    
    // Fiado: valida limite e cria conta a receber
    if (formaPagamento === 'CREDITO_LOJA') {
        if(!clienteId) return window.mostrarAlertaSistema("Venda fiada rejeitada: Selecione um cliente!", "Bloqueio");
        const cliSnap = await get(ref(db, `clientes/${clienteId}`));
        const cli = cliSnap.val();
        const dividaFinal = (cli.saldoDevedor || 0) + totalVendaGlobal;
        
        if(dividaFinal > cli.limiteCredito) {
            return window.mostrarAlertaSistema(`BLOQUEADO: Compra excede o limite do cliente (Limite: R$ ${cli.limiteCredito.toFixed(2)})`, "Limite Excedido");
        }
        await update(ref(db, `clientes/${clienteId}`), { saldoDevedor: dividaFinal });
        await set(push(ref(db, 'contasReceber')), {
            clienteId,
            valor: totalVendaGlobal,
            status: 'Aberto',
            dataLancamento: new Date().toISOString()
        });
    }
    
    // Abate o estoque
    for (let item of carrinho) {
        const pSnap = await get(ref(db, `produtos/${item.id}`));
        if(pSnap.exists()) {
            await update(ref(db, `produtos/${item.id}`), { estoque: (pSnap.val().estoque || 0) - item.quantidade });
        }
    }
    
    // GRAVA VENDA - SEMPRE COM clienteId
    await set(push(ref(db, 'vendas')), {
        caixaId: caixaAtivoId,
        operador: auth.currentUser.email,
        clienteId: clienteId || null,
        items: carrinho,
        total: totalVendaGlobal,
        formaPagamento,
        dataHora: new Date().toISOString()
    });
    
    // Impressão do Cupom
    let itensHtml = carrinho.map(item => `
        <div style="display: flex; justify-content: space-between;"><span>${item.quantidade}x ${item.descricao}</span><span>R$ ${item.subtotal.toFixed(2)}</span></div>
    `).join('');
    
    let cuerpoCupom = `
        <div style="font-size: 14px;">
            <p><strong>Operador:</strong> ${auth.currentUser.email}</p>
            <div class="linha"></div>
            <strong>ITENS:</strong><br>
            ${itensHtml}
            <div class="linha"></div>
            <p style="font-size: 18px; text-align: right;"><strong>TOTAL: R$ ${totalVendaGlobal.toFixed(2)}</strong></p>
            <p><strong>Forma de Pagto:</strong> ${formaPagamento}</p>
        </div>
    `;
    imprimirComprovante("CUPOM FISCAL", cuerpoCupom);
    
    // WhatsApp pro cliente se selecionado
    if (clienteId && listaClientesMemoria[clienteId]) {
        const dadosCliente = listaClientesMemoria[clienteId];
        window.mostrarConfirmacaoSistema(`Venda salva! Deseja enviar o Cupom Digital para o WhatsApp de ${dadosCliente.nome}?`, () => {
            let cupomTexto = `🛍️ *CUPOM FISCAL DIGITAL*\n`;
            cupomTexto += `----------------------------------------\n`;
            cupomTexto += `📅 Data: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}\n`;
            cupomTexto += `👤 Cliente: ${dadosCliente.nome}\n`;
            cupomTexto += `----------------------------------------\n`;
            carrinho.forEach(item => {
                cupomTexto += `${item.quantidade}x ${item.descricao} - R$ ${item.subtotal.toFixed(2)}\n`;
            });
            cupomTexto += `----------------------------------------\n`;
            cupomTexto += `💰 TOTAL: R$ ${totalVendaGlobal.toFixed(2)}\n`;
            cupomTexto += `💳 Pagamento: ${formaPagamento}\n\nObrigado pela preferência!`;
            dispararMensagemWhatsApp(dadosCliente.telefone, cupomTexto);
        });
    }
    
    // Reset carrinho
    carrinho = [];
    document.getElementById('pdv-cliente-id-selecionado').value = '';
    document.getElementById('pdv-busca-cliente').value = '';
    renderizarCarrinhoHTML();
    window.mostrarAlertaSistema("Venda finalizada com sucesso!", "Frente de Caixa");
});

verificarFluxoCaixa();
