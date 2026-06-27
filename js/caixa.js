import { db, auth, ref, push, set, get, update, onAuthStateChanged } from './firebase-config.js';
import { dispararMensagemWhatsApp } from './whatsapp.js';
import { imprimirComprovante } from './impressora.js';
import { $, fmtMoney, fmtDateBR, parseFloatSafe } from './utils.js';

// Estados de Controle Globais do Turno
let caixaAtivoId = null;
let valorInicialTroco = 0;
let carrinho = [];
let totalVendaGlobal = 0;
// Variável global para rastrear se o carrinho veio de uma venda pendente recuperada
let vendaPendenteEmEdicaoId = null;

// Referência rápida de elementos
const telaAbertura = document.getElementById('tela-abertura');
const telaPdv = document.getElementById('tela-pdv');
const navBtnSangria = document.getElementById('nav-btn-sangria');
const navBtnFechar = document.getElementById('nav-btn-fechar');
const barraAuxiliar = document.getElementById('barra-auxiliar-caixa');

// Dados locais
let listaProdutosMemoria = {};
let listaClientesMemoria = {};
let produtoSelecionadoId = null;

// ==========================================
// 1. GERENCIAMENTO DE ESTADO E FLUXO DO CAIXA
// ==========================================
onAuthStateChanged(auth, (user) => {
    if(user) {
        verificarFluxoCaixa();
    } else {
        telaAbertura.style.display = 'block';
        telaPdv.style.display = 'none';
        barraAuxiliar.style.display = 'none';
    }
});

async function verificarFluxoCaixa() {
    const snapshot = await get(ref(db, 'caixas'));
    let caixaAberto = false;

    if (snapshot.exists()) {
        Object.entries(snapshot.val()).forEach(([id, cx]) => {
            if (cx.operador === auth.currentUser.email && cx.status === 'Aberto') {
                caixaAberto = true;
                caixaAtivoId = id;
                valorInicialTroco = cx.valorInicial || 0;
            }
        });
    }

    if (caixaAberto) {
        telaAbertura.style.display = 'none';
        telaPdv.style.display = 'grid';
        barraAuxiliar.style.display = 'block';
        navBtnSangria.style.display = 'inline-block';
        navBtnFechar.style.display = 'inline-block';
        carregarDadosParaBusca();
    } else {
        telaAbertura.style.display = 'block';
        telaPdv.style.display = 'none';
        barraAuxiliar.style.display = 'none';
        navBtnSangria.style.display = 'none';
        navBtnFechar.style.display = 'none';
    }
}

// Botão: Abrir Turno
document.getElementById('btn-confirmar-abertura').addEventListener('click', async () => {
    const troco = parseFloatSafe($('caixa-troco-inicial').value);
    const novaRef = push(ref(db, 'caixas'));

    await set(novaRef, {
        operador: auth.currentUser.email,
        dataHoraAbertura: new Date().toISOString(),
        valorInicial: troco,
        status: 'Aberto'
    });

    caixaAtivoId = novaRef.key;
    imprimirComprovante("ABERTURA DE CAIXA", `<p>Operador: ${auth.currentUser.email}</p><p>Troco: R$ ${troco.toFixed(2)}</p>`);
    window.mostrarAlertaSistema("Caixa iniciado com sucesso! Boas vendas.", "Frente de Caixa");
    verificarFluxoCaixa();
});

// Fechamento - cálculo do valor esperado
navBtnFechar.addEventListener('click', async () => {
    window.modalFechamento.show();
    let totalSuprimentos = 0, totalSangrias = 0, totalDinheiroVendas = 0;

    const sup = await get(ref(db, 'suprimentos'));
    if(sup.exists()) Object.values(sup.val()).forEach(s => {
        if(s.caixaId === caixaAtivoId) totalSuprimentos += parseFloat(s.valor) || 0;
    });

    const san = await get(ref(db, 'sangrias'));
    if(san.exists()) Object.values(san.val()).forEach(s => {
        if(s.caixaId === caixaAtivoId) totalSangrias += parseFloat(s.valor) || 0;
    });

    const ven = await get(ref(db, 'vendas'));
    if(ven.exists()) Object.values(ven.val()).forEach(v => {
        if(v.caixaId === caixaAtivoId && v.formaPagamento === 'DINHEIRO')
            totalDinheiroVendas += parseFloat(v.total) || 0;
    });

    const esperado = valorInicialTroco + totalDinheiroVendas + totalSuprimentos - totalSangrias;
    $('txt-valor-esperado').textContent = esperado.toFixed(2);
});

// Registrar Sangria / Suprimento
document.getElementById('btn-salvar-mov-caixa').addEventListener('click', async () => {
    const tipo = $('modal-mov-tipo').value;
    const valor = parseFloatSafe($('modal-mov-valor').value);
    const justificativa = $('modal-mov-justificativa').value;

    if(isNaN(valor) || valor <= 0 ||!justificativa.trim()) {
        return window.mostrarAlertaSistema("Preencha valor e justificativa!", "Validação");
    }

    const destino = tipo === 'Suprimento'? 'suprimentos' : 'sangrias';
    await set(push(ref(db, destino)), {
        caixaId: caixaAtivoId,
        valor: parseFloat(valor.toFixed(2)),
        justificativa: justificativa.trim(),
        usuario: auth.currentUser.email,
        dataHora: new Date().toISOString()
    });

    imprimirComprovante(`COMPROVANTE DE ${tipo.toUpperCase()}`, `
        <p><strong>Tipo:</strong> ${tipo}</p>
        <p><strong>Valor:</strong> R$ ${valor.toFixed(2)}</p>
        <p><strong>Justificativa:</strong> ${justificativa}</p>
        <p><strong>Operador:</strong> ${auth.currentUser.email}</p>
    `);
    window.mostrarAlertaSistema(`${tipo} lançado com sucesso!`, "Movimentação");
    window.modalSangria.hide();
    $('modal-mov-valor').value = '';
    $('modal-mov-justificativa').value = '';
});

// Confirmar Encerramento de Caixa
document.getElementById('btn-confirmar-fechamento').addEventListener('click', async () => {
    const valorContado = parseFloat(document.getElementById('caixa-valor-contado').value);
    if(isNaN(valorContado)) return window.mostrarAlertaSistema("Digite o valor apurado fisicamente!", "Validação");

    const valorEsperado = parseFloat(document.getElementById('txt-valor-esperado').textContent);
    const diferenca = parseFloat((valorContado - valorEsperado).toFixed(2));
    const dataFechamento = new Date().toISOString();

    await update(ref(db, `caixas/${caixaAtivoId}`), {
        status: 'Fechado',
        dataHoraFechamento: dataFechamento,
        valorEsperado,
        valorContado,
        diferenca,
        justificativaDiferenca: document.getElementById('caixa-justificativa-dif').value || ""
    });

    imprimirComprovante("FECHAMENTO DE CAIXA", `
        <p><strong>Relatório de Fechamento</strong></p>
        <p>Operador: ${auth.currentUser.email}</p>
        <hr>
        <p><strong>Valor Esperado:</strong> R$ ${valorEsperado.toFixed(2)}</p>
        <p><strong>Valor Contado:</strong> R$ ${valorContado.toFixed(2)}</p>
        <p><strong>Diferença:</strong> R$ ${diferenca.toFixed(2)}</p>
        <p><strong>Obs:</strong> ${document.getElementById('caixa-justificativa-dif').value || 'Nenhuma'}</p>
    `);
    window.mostrarAlertaSistema("Turno encerrado e relatório impresso!", "Caixa Fechado");
    window.modalFechamento.hide();
    setTimeout(() => window.location.reload(), 1000);
});

// ==========================================
// 2. SISTEMA DE BUSCA AVANÇADA
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
        if (p.descricao.toLowerCase().includes(termo) || String(p.codigoBarras).includes(termo)) {
            if(filtrados++ >= 5) return;
            const item = document.createElement('div');
            item.className = 'busca-item';
            item.textContent = `${p.codigoBarras} - ${p.descricao} (R$: ${p.valorVenda})`;
            item.addEventListener('click', () => {
                document.getElementById('pdv-busca-produto').value = p.descricao;
                produtoSelecionadoId = id;
                divResultados.style.display = 'none';
            });
            divResultados.appendChild(item);
        }
    });
    divResultados.style.display = filtrados > 0? 'block' : 'none';
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
        const doc = String(c.cpf || "");
        if (c.nome.toLowerCase().includes(termo) || doc.includes(termo)) {
            if(filtrados++ >= 5) return;
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
    divResultados.style.display = filtrados > 0? 'block' : 'none';
});

// Esconde busca ao clicar fora
document.addEventListener('click', (e) => {
    if (!e.target.closest('.position-relative')) {
        document.getElementById('lista-busca-produto').style.display = 'none';
        document.getElementById('lista-busca-cliente').style.display = 'none';
    }
});

// ==========================================
// 3. MOTOR DO CARRINHO E VENDA
// ==========================================
document.getElementById('btn-adicionar-item').addEventListener('click', () => {
    const qtd = parseFloat(document.getElementById('pdv-qtd').value) || 1;
    if (produtoSelecionadoId && listaProdutosMemoria[produtoSelecionadoId]) {
        inserirNoCarrinho(produtoSelecionadoId, listaProdutosMemoria[produtoSelecionadoId], qtd);
    } else {
        const textoInput = document.getElementById('pdv-busca-produto').value.trim();
        let achadoId = null;
        Object.entries(listaProdutosMemoria).forEach(([id, p]) => {
            if(String(p.codigoBarras) === textoInput) achadoId = id;
        });
        if(achadoId) {
            inserirNoCarrinho(achadoId, listaProdutosMemoria[achadoId], qtd);
        } else {
            window.mostrarAlertaSistema("Produto não encontrado!", "Atenção");
        }
    }
});

function inserirNoCarrinho(id, itemDados, qtd) {
    let precoAplicado = parseFloat(itemDados.valorVenda);
    if(itemDados.qtdAtacado && qtd >= itemDados.qtdAtacado && itemDados.valorAtacado > 0) {
        precoAplicado = parseFloat(itemDados.valorAtacado);
    }

    carrinho.push({
        id: id,
        descricao: itemDados.descricao,
        quantidade: qtd,
        precoUnitario: precoAplicado,
        subtotal: parseFloat((precoAplicado * qtd).toFixed(2))
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
    atualizarResumoPagamento();
}

window.removerItemCarrinho = (index) => {
    carrinho.splice(index, 1);
    renderizarCarrinhoHTML();
};

function obterValoresPagamento() {
    return {
        dinheiro: parseFloatSafe($('pdv-valor-dinheiro').value),
        pix: parseFloatSafe($('pdv-valor-pix').value),
        debito: parseFloatSafe($('pdv-valor-debito').value),
        credito: parseFloatSafe($('pdv-valor-credito').value),
        creditoLoja: parseFloatSafe($('pdv-valor-credito-loja').value)
    };
}

function calcularTotalPago() {
    const pagamento = obterValoresPagamento();
    return parseFloat((pagamento.dinheiro + pagamento.pix + pagamento.debito + pagamento.credito + pagamento.creditoLoja).toFixed(2));
}

function gerarDescricaoPagamento(pagamento) {
    const partes = [];
    if (pagamento.dinheiro > 0) partes.push(`Dinheiro R$ ${pagamento.dinheiro.toFixed(2)}`);
    if (pagamento.pix > 0) partes.push(`PIX R$ ${pagamento.pix.toFixed(2)}`);
    if (pagamento.debito > 0) partes.push(`Débito R$ ${pagamento.debito.toFixed(2)}`);
    if (pagamento.credito > 0) partes.push(`Crédito R$ ${pagamento.credito.toFixed(2)}`);
    if (pagamento.creditoLoja > 0) partes.push(`Crédito Loja R$ ${pagamento.creditoLoja.toFixed(2)}`);
    return partes.join(' + ') || 'Nenhum pagamento informado';
}

function atualizarResumoPagamento() {
    const totalPago = calcularTotalPago();
    const troco = parseFloat((totalPago - totalVendaGlobal).toFixed(2));
    $('pdv-total-pago').textContent = `R$ ${totalPago.toFixed(2)}`;
    $('pdv-troco').textContent = `R$ ${troco >= 0 ? troco.toFixed(2) : 0.00}`;
}

['pdv-valor-dinheiro', 'pdv-valor-pix', 'pdv-valor-debito', 'pdv-valor-credito', 'pdv-valor-credito-loja'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('input', atualizarResumoPagamento);
    }
});

// Fechamento de Cupom
document.getElementById('btn-finalizar-venda').addEventListener('click', async () => {
    if(carrinho.length === 0) return window.mostrarAlertaSistema("Carrinho vazio!", "Aviso");

    const clienteId = document.getElementById('pdv-cliente-id-selecionado').value;
    const pagamento = obterValoresPagamento();
    const totalPago = calcularTotalPago();

    if (totalPago < totalVendaGlobal) {
        return window.mostrarAlertaSistema(`Pagamento insuficiente. Total da venda R$ ${totalVendaGlobal.toFixed(2)} e pago R$ ${totalPago.toFixed(2)}.`, "Atenção");
    }

    const troco = parseFloat((totalPago - totalVendaGlobal).toFixed(2));

    if (pagamento.creditoLoja > 0) {
        if(!clienteId) return window.mostrarAlertaSistema("Selecione um cliente para venda fiada!", "Bloqueio");

        const cliSnap = await get(ref(db, `clientes/${clienteId}`));
        if(!cliSnap.exists()) return window.mostrarAlertaSistema("Cliente não encontrado!", "Erro");

        const cli = cliSnap.val();
        const dividaFinal = parseFloat(((cli.saldoDevedor || 0) + pagamento.creditoLoja).toFixed(2));

        if(dividaFinal > (cli.limiteCredito || 0)) {
            return window.mostrarAlertaSistema(`BLOQUEADO: Limite R$ ${(cli.limiteCredito || 0).toFixed(2)} excedido`, "Limite");
        }

        await update(ref(db, `clientes/${clienteId}`), { saldoDevedor: dividaFinal });
        await set(push(ref(db, 'contasReceber')), {
            clienteId,
            clienteNome: cli.nome,
            valor: pagamento.creditoLoja,
            status: 'Aberto',
            dataLancamento: new Date().toISOString()
        });
    }

    // Abate o estoque
    for (let item of carrinho) {
        const pSnap = await get(ref(db, `produtos/${item.id}`));
        if(pSnap.exists()) {
            const estoqueAtual = parseFloat(pSnap.val().estoque || 0);
            await update(ref(db, `produtos/${item.id}`), { estoque: estoqueAtual - item.quantidade });
        }
    }

    // GRAVA VENDA
    await set(push(ref(db, 'vendas')), {
        caixaId: caixaAtivoId,
        operador: auth.currentUser.email,
        clienteId: clienteId || null,
        items: carrinho,
        total: parseFloat(totalVendaGlobal.toFixed(2)),
        pagamento: pagamento,
        totalPago: totalPago,
        troco: troco,
        dataHora: new Date().toISOString()
    });

// Cole estas linhas no fluxo de sucesso do fechamento normal da venda (F10):
if (vendaPendenteEmEdicaoId) {
    await remove(ref(db, `vendas_pendentes/${vendaPendenteEmEdicaoId}`));
    vendaPendenteEmEdicaoId = null;
}


    // Impressão do Cupom
    let itensHtml = carrinho.map(item => `
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span>${item.quantidade}x ${item.descricao}</span>
            <span>R$ ${item.subtotal.toFixed(2)}</span>
        </div>
    `).join('');

    const descricaoPagamento = gerarDescricaoPagamento(pagamento);

    imprimirComprovante("CUPOM FISCAL", `
        <div style="font-size: 14px;">
            <p><strong>Operador:</strong> ${auth.currentUser.email}</p>
            <hr>
            <strong>ITENS:</strong><br>
            ${itensHtml}
            <hr>
            <p style="font-size: 18px; text-align: right;"><strong>TOTAL: R$ ${totalVendaGlobal.toFixed(2)}</strong></p>
            <p><strong>Pagamento:</strong> ${descricaoPagamento}</p>
            <p><strong>Total Pago:</strong> R$ ${totalPago.toFixed(2)}</p>
            <p><strong>Troco:</strong> R$ ${troco.toFixed(2)}</p>
        </div>
    `);

    // WhatsApp
    if (clienteId && listaClientesMemoria[clienteId]) {
        const dadosCliente = listaClientesMemoria[clienteId];
        window.mostrarConfirmacaoSistema(`Enviar cupom pro WhatsApp de ${dadosCliente.nome}?`, () => {
            let cupomTexto = `🛍️ CUPOM FISCAL DIGITAL\n`;
            cupomTexto += `Data: ${new Date().toLocaleString('pt-BR')}\n`;
            cupomTexto += `Cliente: ${dadosCliente.nome}\n`;
            cupomTexto += `--------------------------\n`;
            carrinho.forEach(item => {
                cupomTexto += `${item.quantidade}x ${item.descricao} - R$ ${item.subtotal.toFixed(2)}\n`;
            });
            cupomTexto += `--------------------------\n`;
            cupomTexto += `TOTAL: R$ ${totalVendaGlobal.toFixed(2)}\n`;
            cupomTexto += `Pagamento: ${descricaoPagamento}\n`;
            cupomTexto += `Pago: R$ ${totalPago.toFixed(2)}\n`;
            cupomTexto += `Troco: R$ ${troco.toFixed(2)}\n\nObrigado!`;
            dispararMensagemWhatsApp(dadosCliente.telefone, cupomTexto);
        });
    }

    // Reset carrinho
    carrinho = [];
    document.getElementById('pdv-cliente-id-selecionado').value = '';
    document.getElementById('pdv-busca-cliente').value = '';
    renderizarCarrinhoHTML();
    window.mostrarAlertaSistema("Venda finalizada com sucesso!", "Sucesso");
});
// ==========================================
// CONTROLADOR DE VENDAS PENDENTES CORRIGIDO
// ==========================================

// 1. SALVAR OU ATUALIZAR A VENDA COMO PENDENTE E GERAR COMANDA
document.getElementById('btn-pendente-venda').addEventListener('click', async () => {
    if (carrinho.length === 0) return window.mostrarAlertaSistema("Carrinho vazio!", "Aviso");
    
    const clienteId = document.getElementById('pdv-cliente-id-selecionado').value;
    if (!clienteId) {
        return window.mostrarAlertaSistema("Selecione um cliente para registrar a entrega pendente!", "Atenção");
    }

    const dadosCliente = listaClientesMemoria[clienteId];
    
    const vendaPendente = {
        caixaId: caixaAtivoId,
        operador: auth.currentUser.email,
        clienteId: clienteId,
        clienteNome: dadosCliente.nome,
        items: carrinho,
        total: parseFloat(totalVendaGlobal.toFixed(2)),
        status: 'Pendente',
        dataHora: new Date().toISOString()
    };

    // CORREÇÃO DA DUPLICAÇÃO: Verifica se já era uma pendência sendo reconfigurada/editada
    if (vendaPendenteEmEdicaoId) {
        await set(ref(db, `vendas_pendentes/${vendaPendenteEmEdicaoId}`), vendaPendente);
    } else {
        const novaPendenciaRef = push(ref(db, 'vendas_pendentes'));
        await set(novaPendenciaRef, vendaPendente);
    }

    // Impressão da Comanda de Entrega para o Motoboy
    let itensHtml = carrinho.map(item => `
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span>${item.quantidade}x ${item.descricao}</span>
            <span>R$ ${item.subtotal.toFixed(2)}</span>
        </div>
    `).join('');

    const endereco = `${dadosCliente.rua || 'Não informado'}, ${dadosCliente.bairro || ''}`;

    imprimirComprovante("COMANDA DE ENTREGA (PENDENTE)", `
        <div style="font-size: 14px; font-family: monospace;">
            <p><strong>Cliente:</strong> ${dadosCliente.nome}</p>
            <p><strong>Telefone:</strong> ${dadosCliente.telefone || 'N/I'}</p>
            <p><strong>Endereço:</strong> ${endereco}</p>
            <hr style="border-style: dashed;">
            <strong>ITENS DO PEDIDO:</strong><br>
            ${itensHtml}
            <hr style="border-style: dashed;">
            <p style="font-size: 16px; text-align: right;"><strong>TOTAL A RECEBER: R$ ${totalVendaGlobal.toFixed(2)}</strong></p>
            <p style="text-align: center; margin-top: 10px; border: 1px solid #000; padding: 5px;">📦 ENTREGAR COM MOTOBOY</p>
        </div>
    `);

    // Reseta o estado do PDV e a variável de controle
    carrinho = [];
    vendaPendenteEmEdicaoId = null; 
    document.getElementById('pdv-cliente-id-selecionado').value = '';
    document.getElementById('pdv-busca-cliente').value = '';
    renderizarCarrinhoHTML();
    window.mostrarAlertaSistema("Pedido pendente salvo com sucesso! Comanda impressa.", "Sucesso");
});

// 2. BUSCAR COMPRA PENDENTE E EXIBIR MODAL
document.getElementById('btn-consultar-pendentes').addEventListener('click', async () => {
    let modal = document.getElementById('modal-lista-pendentes');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-lista-pendentes';
        modal.className = 'modal fade';
        modal.tabIndex = -1;
        modal.innerHTML = `
            <div class="modal-dialog modal-lg modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header bg-warning text-dark">
                        <h5 class="modal-title fw-bold">⏳ Entregas / Vendas Pendentes</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body" style="max-height: 400px; overflow-y: auto;">
                        <table class="table table-hover align-middle">
                            <thead>
                                <tr>
                                    <th>Cliente</th>
                                    <th>Data/Hora</th>
                                    <th>Itens</th>
                                    <th>Total</th>
                                    <th>Ação</th>
                                </tr>
                            </thead>
                            <tbody id="corpo-tabela-pendentes"></tbody>
                        </table>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modal);
    }

    const tbody = document.getElementById('corpo-tabela-pendentes');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Carregando pendências...</td></tr>';

    const bsModal = bootstrap.Modal.getOrCreateInstance(modal);
    bsModal.show();

    const snapshot = await get(ref(db, 'vendas_pendentes'));
    tbody.innerHTML = '';

    if (!snapshot.exists()) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Nenhuma venda pendente na rua.</td></tr>';
        return;
    }

    snapshot.forEach((childSnapshot) => {
        const idKey = childSnapshot.key;
        const v = childSnapshot.val();
        const dataFmt = new Date(v.dataHora).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${v.clienteNome}</strong></td>
            <td>${dataFmt}</td>
            <td>${v.items.length} item(ns)</td>
            <td class="fw-bold text-danger">R$ ${v.total.toFixed(2)}</td>
            <td>
                <button class="btn btn-sm btn-success fw-bold" onclick="recuperarPendenciaParaOFluxo('${idKey}')">
                    ⚡ Trazer p/ Caixa
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
});

// 3. RECUPERAR A PENDÊNCIA E FECHAR O MODAL CORRETAMENTE
window.recuperarPendenciaParaOFluxo = async (pendenciaId) => {
    const snap = await get(ref(db, `vendas_pendentes/${pendenciaId}`));
    if (snap.exists()) {
        const dados = snap.val();

        // Carrega os dados no carrinho e identifica o cliente
        carrinho = dados.items;
        document.getElementById('pdv-cliente-id-selecionado').value = dados.clienteId;
        document.getElementById('pdv-busca-cliente').value = dados.clienteNome;
        
        // Define o ID em edição para impedir duplicação ao clicar em "Pendente" novamente
        vendaPendenteEmEdicaoId = pendenciaId;

        renderizarCarrinhoHTML();

        // CORREÇÃO DO MODAL: Fecha o modal limpando as instâncias corretamente
        const modalEl = document.getElementById('modal-lista-pendentes');
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) {
            modalInstance.hide();
        }

        window.mostrarAlertaSistema("Pedido carregado! Para finalizar, adicione o pagamento e pressione F10.", "Sucesso");
    }
};

