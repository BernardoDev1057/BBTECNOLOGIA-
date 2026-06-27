// js/dashboard.js
import { db, auth, ref, get, onValue, onAuthStateChanged } from './firebase-config.js';
import { $, setText, fmtMoney } from './utils.js';

let bootstrapToastInstance = null;
let sistemaJaInicializado = false;

function dispararNotificacaoToast(mensagem) {
    const toastEl = $('liveToast');
    if (!toastEl) return;
    if (!bootstrapToastInstance && window.bootstrap) {
        bootstrapToastInstance = new window.bootstrap.Toast(toastEl);
    }
    const msgCorpo = $('toast-mensagem-conteudo');
    if (msgCorpo) msgCorpo.innerHTML = `🔔 ${mensagem}`;
    if (bootstrapToastInstance) bootstrapToastInstance.show();
}

function inicializarEscutasDashboard() {
    // Escuta ativa em tempo real para a coleção de vendas definitivas
    onValue(ref(db, 'vendas'), async () => {
        if (sistemaJaInicializado) {
            dispararNotificacaoToast("Movimentação de venda detetada no sistema!");
        }
        await processarMetricasDashboard();
        sistemaJaInicializado = true;
    });

    // Escuta ativa em tempo real para as vendas pendentes (Entregas na rua)
    onValue(ref(db, 'vendas_pendentes'), async () => {
        if (sistemaJaInicializado) {
            dispararNotificacaoToast("Nova entrega ou pendência atualizada!");
        }
        await processarMetricasDashboard();
    });

    // Escuta para as demais coleções do sistema
    ['produtos', 'caixas', 'contasReceber'].forEach(tabela => {
        onValue(ref(db, tabela), () => {
            if (sistemaJaInicializado) dispararNotificacaoToast(`Dados de [${tabela.toUpperCase()}] atualizados.`);
            processarMetricasDashboard();
        });
    });
}

async function processarMetricasDashboard() {
    try {
        const agora = new Date();
        const ano = agora.getFullYear();
        const mes = String(agora.getMonth() + 1).padStart(2, '0');
        const dia = String(agora.getDate()).padStart(2, '0');
        
        const hojeStr = `${ano}-${mes}-${dia}`; // "YYYY-MM-DD"
        const anoMesStr = `${ano}-${mes}`;     // "YYYY-MM"

        // Puxa todos os nós em paralelo para cruzamento de dados (Incluindo vendas_pendentes)
        const [prodSnap, venSnap, cxSnap, recSnap, supSnap, sanSnap, penSnap] = await Promise.all([
            get(ref(db, 'produtos')),
            get(ref(db, 'vendas')),
            get(ref(db, 'caixas')),
            get(ref(db, 'contasReceber')),
            get(ref(db, 'suprimentos')),
            get(ref(db, 'sangrias')),
            get(ref(db, 'vendas_pendentes')) // <-- Adicionado o nó correto das pendências
        ]);

        const produtosMap = prodSnap.exists() ? prodSnap.val() : {};

        // 1. MÉTRICA: ALERTA DE ESTOQUE BAIXO (Limite <= 10)
        let contagemEstoqueBaixo = 0;
        Object.values(produtosMap).forEach(p => {
            if ((p.estoque || 0) <= 10) contagemEstoqueBaixo++;
        });
        setText('db-estoque-baixo', contagemEstoqueBaixo);

        // 2. MÉTRICA: CONTAS A RECEBER
        let totalContasReceber = 0;
        if (recSnap.exists()) {
            Object.values(recSnap.val()).forEach(r => {
                if (r.status === 'Aberto') totalContasReceber += (r.valor || 0);
            });
        }
        setText('db-contas-receber', fmtMoney(totalContasReceber));

        // 3. CARD DE ENTREGAS (Preenchido a partir do nó 'vendas_pendentes')
        let totalVendasPendentes = 0;
        const listaPendentesHTML = [];

        if (penSnap.exists()) {
            Object.values(penSnap.val()).forEach(v => {
                if (!v) return;
                totalVendasPendentes++;
                
                const nomeCliente = v.clienteNome || "Cliente Não Informado";
                const enderecoCliente = v.enderecoEntrega || "Retirada/Sem Endereço";
                const valorVendaPendente = v.total || 0;

                listaPendentesHTML.push(`
                    <li class="list-group-item d-flex justify-content-between align-items-start py-2 fs-6">
                        <div class="ms-2 me-auto text-truncate" style="max-width: 75%;">
                            <div class="fw-bold text-dark">${nomeCliente}</div>
                            <span class="text-muted small">${enderecoCliente}</span>
                        </div>
                        <span class="badge bg-warning text-dark rounded-pill fw-bold">${fmtMoney(valorVendaPendente)}</span>
                    </li>
                `);
            });
        }

        // 4. MÉTRICAS FINANCEIRAS E RANKING (Apenas vendas consolidadas)
        let faturamentoHoje = 0;
        let faturamentoMes = 0;
        let totalLucro = 0;
        let qtdVendasHoje = 0;
        const rankingProdutos = {};

        if (venSnap.exists()) {
            Object.values(venSnap.val()).forEach(v => {
                if (!v || v.cancelado === true || v.ativo === false) return;

                // Extração segura da data ("YYYY-MM-DD")
                const dataVendaStr = v.dataHora ? v.dataHora.split('T')[0] : "";
                const anoMesVendaStr = dataVendaStr.substring(0, 7);

                if (dataVendaStr === hojeStr) {
                    faturamentoHoje += (v.total || 0);
                    qtdVendasHoje++;
                }
                if (anoMesVendaStr === anoMesStr) {
                    faturamentoMes += (v.total || 0);
                }

                // Mapeia tanto 'itens' quanto 'items' para segurança
                const itensBrutos = v.itens || v.items;
                if (itensBrutos) {
                    const itensArray = Array.isArray(itensBrutos) ? itensBrutos : Object.values(itensBrutos);
                    itensArray.forEach(item => {
                        if (!item) return;
                        const desc = item.descricao || "Produto Sem Nome";
                        rankingProdutos[desc] = (rankingProdutos[desc] || 0) + (item.quantidade || 0);
                        
                        const pId = item.produtoId || item.id;
                        const dadosOriginaisProduto = produtosMap[pId];
                        if (dadosOriginaisProduto) {
                            const custoUnitario = dadosOriginaisProduto.valorCusto || 0;
                            const precoVendaItem = item.precoUnitario || 0;
                            totalLucro += ((precoVendaItem - custoUnitario) * (item.quantidade || 0));
                        }
                    });
                }
            });
        }

        // Atualização visual dos cards principais
        setText('db-vendas-hoje', fmtMoney(faturamentoHoje));
        setText('db-vendas-mes', fmtMoney(faturamentoMes));
        setText('db-lucro', fmtMoney(totalLucro));
        setText('db-ticket', fmtMoney(qtdVendasHoje > 0 ? (faturamentoHoje / qtdVendasHoje) : 0));

        // Renderiza a lista de Entregas Pendentes na interface
        setText('db-qtd-pendentes', `${totalVendasPendentes} pendentes`);
        const containerListaPendentes = $('lista-entregas-pendentes');
        if (containerListaPendentes) {
            containerListaPendentes.innerHTML = listaPendentesHTML.length === 0 
                ? `<li class="list-group-item text-center text-muted py-4">Nenhuma entrega pendente encontrada.</li>`
                : listaPendentesHTML.join('');
        }

        // Renderiza a tabela de Ranking de Produtos (Top 5)
        const tabelaRanking = $('tabela-mais-vendidos');
        if (tabelaRanking) {
            tabelaRanking.innerHTML = '';
            const produtosOrdenados = Object.entries(rankingProdutos).sort((a, b) => b[1] - a[1]).slice(0, 5);
            if (produtosOrdenados.length === 0) {
                tabelaRanking.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-4">Nenhuma venda registrada este mês.</td></tr>`;
            } else {
                produtosOrdenados.forEach(([descricao, qtd], index) => {
                    tabelaRanking.innerHTML += `<tr><td><b>${index + 1}º</b></td><td>${descricao}</td><td>${qtd} un</td></tr>`;
                });
            }
        }

        // 5. DINHEIRO NO CAIXA ATUAL (Consolida TODOS os caixas abertos no momento)
        let saldoDinheiroCaixa = 0;
        let temCaixaAberto = false;

        if (cxSnap.exists()) {
            const caixasAbertosIds = [];

            Object.entries(cxSnap.val()).forEach(([id, cx]) => {
                if (cx.status === 'Aberto') {
                    temCaixaAberto = true;
                    caixasAbertosIds.push(id);
                    saldoDinheiroCaixa += (cx.valorInicial || 0);
                }
            });

            if (temCaixaAberto) {
                if (venSnap.exists()) {
                    Object.values(venSnap.val()).forEach(v => {
                        if (!v || String(v.status).toLowerCase() === 'pendente' || v.cancelado === true || v.ativo === false) return;
                        
                        if (caixasAbertosIds.includes(v.caixaId)) {
                            if (v.formaPagamento === 'Dinheiro') {
                                saldoDinheiroCaixa += (v.total || 0);
                            } else if (v.pagamento && (v.pagamento.dinheiro || v.pagamento.Dinheiro)) {
                                saldoDinheiroCaixa += (v.pagamento.dinheiro || v.pagamento.Dinheiro || 0);
                            }
                        }
                    });
                }

                if (supSnap.exists()) {
                    Object.values(supSnap.val()).forEach(s => { 
                        if (caixasAbertosIds.includes(s.caixaId)) saldoDinheiroCaixa += (s.valor || 0); 
                    });
                }

                if (sanSnap.exists()) {
                    Object.values(sanSnap.val()).forEach(s => { 
                        if (caixasAbertosIds.includes(s.caixaId)) saldoDinheiroCaixa -= (s.valor || 0); 
                    });
                }

                setText('db-caixa-atual', fmtMoney(saldoDinheiroCaixa));
            } else {
                setText('db-caixa-atual', "Nenhum Caixa Aberto");
            }
        }
    } catch (erro) {
        console.error("Erro crítico ao renderizar métricas:", erro);
    }
}

// Inicializa com segurança ao confirmar autenticação ativa
onAuthStateChanged(auth, (user) => {
    if (user) {
        inicializarEscutasDashboard();
    } else {
        console.warn("Usuário não autenticado detetado no escopo do Dashboard.");
    }
});

