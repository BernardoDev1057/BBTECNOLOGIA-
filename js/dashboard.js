import { db, auth, ref, get } from './firebase-config.js';
import { $, setText, fmtMoney, isoDate } from './utils.js';

async function processarMétricasDashboard() {
    if (!auth.currentUser) return;

    // Pega as datas de controle baseadas no fuso local do dispositivo
    const agora = new Date();
    const hojeStr = isoDate(agora); // Formato "YYYY-MM-DD"
    const anoMesStr = hojeStr.substring(0, 7); // Formato "YYYY-MM"

    // 1. Busca tabelas chaves em paralelo para performance
    const [prodSnap, venSnap, cxSnap, recSnap] = await Promise.all([
        get(ref(db, 'produtos')),
        get(ref(db, 'vendas')),
        get(ref(db, 'caixas')),
        get(ref(db, 'contasReceber'))
    ]);

    // Bancos locais para cruzamento de dados de custo/lucro
    const produtosMap = prodSnap.exists() ? prodSnap.val() : {};
    
    // ==========================================
    // MÉTRICA A: PRODUTOS COM ESTOQUE BAIXO
    // ==========================================
    let contagemEstoqueBaixo = 0;
    Object.values(produtosMap).forEach(p => {
        if ((p.estoque || 0) <= 10) contagemEstoqueBaixo++;
    });
    setText('db-estoque-baixo', contagemEstoqueBaixo);

    // ==========================================
    // MÉTRICA B: CONTAS A RECEBER (CRÉDITO LOJA)
    // ==========================================
    let totalContasReceber = 0;
    if (recSnap.exists()) {
        Object.values(recSnap.val()).forEach(r => {
            if (r.status === 'Aberto') totalContasReceber += r.valor;
        });
    }
    setText('db-contas-receber', fmtMoney(totalContasReceber));

    // ==========================================
    // MÉTRICAS C: VENDAS, LUCRO, TICKET MÉDIO e RANKING
    // ==========================================
    let faturamentoHoje = 0;
    let faturamentoMes = 0;
    let totalLucro = 0;
    let qtdVendasHoje = 0;
    const rankingProdutos = {}; // Dicionário para contar saída de itens

    if (venSnap.exists()) {
        Object.values(venSnap.val()).forEach(v => {
            const dataVendaStr = v.dataHora.split('T')[0];
            const anoMesVendaStr = dataVendaStr.substring(0, 7);

            // Filtro Diário
            if (dataVendaStr === hojeStr) {
                faturamentoHoje += v.total;
                qtdVendasHoje++;
            }

            // Filtro Mensal
            if (anoMesVendaStr === anoMesStr) {
                faturamentoMes += v.total;
            }

            // Cálculo de Margem e Lucro Real (Preço Venda - Preço Custo) de cada item vendido
            if (v.items && Array.isArray(v.items)) {
                v.items.forEach(item => {
                    // Contagem para o Ranking
                    rankingProdutos[item.descricao] = (rankingProdutos[item.descricao] || 0) + item.quantidade;

                    // Lucro do item
                    const dadosOriginaisProduto = produtosMap[item.id];
                    if (dadosOriginaisProduto) {
                        const custoUnitario = dadosOriginaisProduto.valorCusto || 0;
                        const lucroUnitario = item.precoUnitario - custoUnitario;
                        totalLucro += (lucroUnitario * item.quantidade);
                    }
                });
            }
        });
    }

    const ticketMedio = qtdVendasHoje > 0 ? (faturamentoHoje / qtdVendasHoje) : 0;

    setText('db-vendas-hoje', fmtMoney(faturamentoHoje));
    setText('db-vendas-mes', fmtMoney(faturamentoMes));
    setText('db-lucro', fmtMoney(totalLucro));
    setText('db-ticket', fmtMoney(ticketMedio));

    // RENDERIZAR TABELA DE MAIS VENDIDOS (TOP 5)
    const tabelaRanking = $('tabela-mais-vendidos');
    tabelaRanking.innerHTML = '';
    
    const produtosOrdenados = Object.entries(rankingProdutos)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    if (produtosOrdenados.length === 0) {
        tabelaRanking.innerHTML = `<tr><td colspan="3" style="text-align: center; color: #999;">Nenhuma venda registrada no mês.</td></tr>`;
    } else {
        produtosOrdenados.forEach(([descricao, qtd], index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><b>${index + 1}º</b></td>
                <td>${descricao}</td>
                <td>${qtd} unidades</td>
            `;
            tabelaRanking.appendChild(tr);
        });
    }

    // ==========================================
    // MÉTRICA D: DINHEIRO VIVO NO CAIXA ATUAL
    // ==========================================
    let saldoDinheiroCaixa = 0;
    if (cxSnap.exists()) {
        // Encontra o caixa do operador logado que está aberto
        let caixaAtivoId = null;
        let valorInicial = 0;

        Object.entries(cxSnap.val()).forEach(([id, cx]) => {
            if (cx.operador === auth.currentUser.email && cx.status === 'Aberto') {
                caixaAtivoId = id;
                valorInicial = cx.valorInicial || 0;
            }
        });

        if (caixaAtivoId) {
            saldoDinheiroCaixa = valorInicial;

            // Soma vendas em dinheiro deste caixa específico
            if (venSnap.exists()) {
                Object.values(venSnap.val()).forEach(v => {
                    if (v.caixaId === caixaAtivoId && v.formaPagamento === 'Dinheiro') {
                        saldoDinheiroCaixa += v.total;
                    }
                });
            }

            // Soma suprimentos e abate sangrias por requests adicionais rápidos
            const [supSnap, sanSnap] = await Promise.all([
                get(ref(db, 'suprimentos')),
                get(ref(db, 'sangrias'))
            ]);

            if (supSnap.exists()) {
                Object.values(supSnap.val()).forEach(s => { if (s.caixaId === caixaAtivoId) saldoDinheiroCaixa += s.valor; });
            }
            if (sanSnap.exists()) {
                Object.values(sanSnap.val()).forEach(s => { if (s.caixaId === caixaAtivoId) saldoDinheiroCaixa -= s.valor; });
            }
            setText('db-caixa-atual', fmtMoney(saldoDinheiroCaixa));
        } else {
            setText('db-caixa-atual', "Caixa Fechado");
        }
    }
}

// Inicializa a escuta assim que o auth carregar o token do cookie de sessão local
setTimeout(processarMétricasDashboard, 1500);

