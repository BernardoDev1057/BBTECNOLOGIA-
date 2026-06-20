import { db, ref, get } from './firebase-config.js';
import { $, isoDate } from './utils.js';

window.addEventListener('DOMContentLoaded', () => {
    const agora = new Date();
    const inputInicio = $('rep-data-inicio');
    const inputFim = $('rep-data-fim');

    if (inputInicio) {
        inputInicio.value = isoDate(new Date(agora.getFullYear(), agora.getMonth(), 1));
    }
    if (inputFim) {
        inputFim.value = isoDate(agora);
    }

    const btnGerar = $('btn-gerar-relatorio');
    if (btnGerar) {
        btnGerar.addEventListener('click', processarRelatorio);
    }
});

async function processarRelatorio() {
    const selectTipo = $('rep-tipo');
    const inputInicio = $('rep-data-inicio');
    const inputFim = $('rep-data-fim');
    const selectForma = $('rep-forma-pagamento');
    const colunas = $('colunas-relatorio');
    const corpo = $('corpo-relatorio');
    const titulo = $('titulo-relatorio');

    if (!selectTipo || !inputInicio || !inputFim || !colunas || !corpo || !titulo) {
        console.error('Elementos essenciais do relatório não encontrados:', {
            selectTipo, inputInicio, inputFim, selectForma, colunas, corpo, titulo
        });
        return;
    }

    const tipo = selectTipo.value;
    const dataInicio = inputInicio.value || '';
    const dataFim = inputFim.value || '';
    const formaPagamentoFiltro = selectForma ? selectForma.value : 'todos';

    corpo.innerHTML = "<tr><td style='text-align:center;'>Buscando registros...</td></tr>";

    // Puxa tabelas bases para cruzamento de dados em memória
    const [venSnap, prodSnap, cxSnap, supSnap, sanSnap, recSnap, cliSnap, movSnap] = await Promise.all([
        get(ref(db, 'vendas')), get(ref(db, 'produtos')), get(ref(db, 'caixas')),
        get(ref(db, 'suprimentos')), get(ref(db, 'sangrias')), get(ref(db, 'contasReceber')),
        get(ref(db, 'clientes')), get(ref(db, 'movimentacoesEstoque'))
    ]);

    const vendas = venSnap.exists() ? Object.values(venSnap.val()) : [];
    const produtos = prodSnap.exists() ? prodSnap.val() : {};
    const clientes = cliSnap.exists() ? cliSnap.val() : {};

    // Auxiliar para filtrar arrays por intervalo de datas (padrão ISO)
    const filtrarPorData = (lista, chaveData) => {
        return lista.filter(item => {
            const dataItem = item[chaveData].split('T')[0];
            return dataItem >= dataInicio && dataItem <= dataFim;
        });
    };

    const obterFormasPagamento = (venda) => {
        if (venda.pagamento) {
            const formas = [];
            if (venda.pagamento.dinheiro > 0) formas.push('DINHEIRO');
            if (venda.pagamento.pix > 0) formas.push('PIX');
            if (venda.pagamento.debito > 0) formas.push('DEBITO');
            if (venda.pagamento.credito > 0) formas.push('CREDITO');
            if (venda.pagamento.creditoLoja > 0) formas.push('CREDITO_LOJA');
            return formas;
        }
        if (venda.formaPagamento) return [venda.formaPagamento.toUpperCase()];
        if (venda.formaPgto) return [venda.formaPgto.toUpperCase()];
        return [];
    };

    const matchesFormaPagamento = (venda, filtro) => {
        if (filtro === 'todos') return true;
        const formas = obterFormasPagamento(venda);
        if (filtro === 'credito') {
            return formas.includes('CREDITO') && !formas.includes('CREDITO_LOJA');
        }
        if (filtro === 'credito_loja') {
            return formas.includes('CREDITO_LOJA');
        }
        return formas.includes(filtro.toUpperCase());
    };

    const formatarFormaPagamentoRelatorio = (venda) => {
        const formas = obterFormasPagamento(venda);
        return formas.length ? formas.join(' + ') : 'N/I';
    };

    // ==========================================
    // RELATÓRIO 1: VENDAS POR PERÍODO (DIA/MÊS)
    // ==========================================
    if (tipo === 'vendas_periodo') {
        titulo.textContent = `Relatório de Faturamento por Período (${dataInicio} até ${dataFim})`;
        colunas.innerHTML = `<th>Data</th><th>Qtd Itens Vendidos</th><th>Forma de Pagamento</th><th>Cliente</th><th>Valor Total</th>`;
        
        const filtradas = filtrarPorData(vendas, 'dataHora').filter(v => matchesFormaPagamento(v, formaPagamentoFiltro));
        corpo.innerHTML = '';
        let faturamentoAcumulado = 0;

        filtradas.forEach(v => {
            faturamentoAcumulado += v.total;
            let totalItens = v.items ? v.items.reduce((acc, i) => acc + i.quantidade, 0) : 0;

            const nomeCliente = v.clienteId && clientes[v.clienteId]
                        ? clientes[v.clienteId].nome
                                    : 'Consumidor Final';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${new Date(v.dataHora).toLocaleString('pt-BR')}</td>
                <td>${totalItens}</td>
                <td>${formatarFormaPagamentoRelatorio(v)}</td>
                <td>${nomeCliente}</td>
                <td>R$ ${v.total.toFixed(2)}</td>
            `;
            corpo.appendChild(tr);
        });

        const trTotal = document.createElement('tr');
        trTotal.className = 'total-row';
        trTotal.innerHTML = `<td colspan="3">Faturamento Total Bruto:</td><td>R$ ${faturamentoAcumulado.toFixed(2)}</td>`;
        corpo.appendChild(trTotal);
    }

    // ==========================================
    // RELATÓRIO 2: VENDAS POR HORA (FLUXO)
    // ==========================================
    else if (tipo === 'vendas_hora') {
        titulo.textContent = `Fluxo de Vendas por Hora do Dia`;
        colunas.innerHTML = `<th>Faixa Horária</th><th>Quantidade de Cupons Emitidos</th><th>Total Vendido</th>`;
        
        const filtradas = filtrarPorData(vendas, 'dataHora');
        const horasAgrupadas = Array(24).fill(0).map(() => ({ cupons: 0, valor: 0 }));

        filtradas.forEach(v => {
            const hora = new Date(v.dataHora).getHours();
            horasAgrupadas[hora].cupons++;
            horasAgrupadas[hora].valor += v.total;
        });

        corpo.innerHTML = '';
        horasAgrupadas.forEach((dados, hora) => {
            if(dados.cupons > 0) {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${hora.toString().padStart(2, '0')}:00h às ${hora}:59h</td><td>${dados.cupons}</td><td>R$ ${dados.valor.toFixed(2)}</td>`;
                corpo.appendChild(tr);
            }
        });
    }

    // ==========================================
    // RELATÓRIO 3: GIRO DE ESTOQUE
    // ==========================================
    else if (tipo === 'giro_estoque') {
        titulo.textContent = `Giro de Estoque e Valor de Ativos`;
        colunas.innerHTML = `<th>Cód. Barras</th><th>Descrição</th><th>Estoque Físico</th><th>Preço de Custo</th><th>Preço de Venda</th><th>Total em Custo (Ativo)</th>`;
        
        corpo.innerHTML = '';
        let custoTotalPatrimonio = 0;

        Object.values(produtos).forEach(p => {
            const totalCustoItem = (p.estoque || 0) * (p.valorCusto || 0);
            custoTotalPatrimonio += totalCustoItem;
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${p.codigoBarras}</td>
                <td>${p.descricao}</td>
                <td style="color: ${(p.estoque || 0) <= 10 ? 'red' : 'black'}"><b>${p.estoque || 0}</b></td>
                <td>R$ ${(p.valorCusto || 0).toFixed(2)}</td>
                <td>R$ ${p.valorVenda.toFixed(2)}</td>
                <td>R$ ${totalCustoItem.toFixed(2)}</td>
            `;
            corpo.appendChild(tr);
        });

        const trTotal = document.createElement('tr');
        trTotal.className = 'total-row';
        trTotal.innerHTML = `<td colspan="5">Capital Total Imobilizado em Estoque (Custo):</td><td>R$ ${custoTotalPatrimonio.toFixed(2)}</td>`;
        corpo.appendChild(trTotal);
    }

    // ==========================================
    // RELATÓRIO 4: FECHAMENTOS DE CAIXA
    // ==========================================
    else if (tipo === 'fechamentos') {
        titulo.textContent = `Relatório de Fechamentos de Turno (Caixas)`;
        colunas.innerHTML = `<th>Operador</th><th>Abertura</th><th>Fechamento</th><th>Esperado</th><th>Contado</th><th>Diferença</th>`;
        
        corpo.innerHTML = '';
        if (cxSnap.exists()) {
            const list = filtrarPorData(Object.values(cxSnap.val()), 'dataHoraAbertura');
            list.forEach(c => {
                if(c.status === 'Fechado') {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${c.operador}</td>
                        <td>${new Date(c.dataHoraAbertura).toLocaleString('pt-BR')}</td>
                        <td>${new Date(c.dataHoraFechamento).toLocaleString('pt-BR')}</td>
                        <td>R$ ${c.valorEsperado.toFixed(2)}</td>
                        <td>R$ ${c.valorContado.toFixed(2)}</td>
                        <td style="color: ${c.diferenca < 0 ? 'red' : 'green'}">R$ ${c.diferenca.toFixed(2)}</td>
                    `;
                    corpo.appendChild(tr);
                }
            });
        }
    }

    // ==========================================
    // RELATÓRIO 5: SANGRIAS E SUPRIMENTOS
    // ==========================================
    else if (tipo === 'sangrias_suprimentos') {
        titulo.textContent = `Histórico de Sangrias e Suprimentos de Caixa`;
        colunas.innerHTML = `<th>Data/Hora</th><th>Tipo</th><th>Valor</th><th>Justificativa</th><th>Operador</th>`;
        
        corpo.innerHTML = '';
        let listaMovs = [];
        if(supSnap.exists()) Object.values(supSnap.val()).forEach(s => listaMovs.push({...s, tipo: 'Suprimento'}));
        if(sanSnap.exists()) Object.values(sanSnap.val()).forEach(s => listaMovs.push({...s, tipo: 'Sangria'}));
        
        const filtradas = filtrarPorData(listaMovs, 'dataHora');
        filtradas.sort((a,b) => new Date(b.dataHora) - new Date(a.dataHora));

        filtradas.forEach(m => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${new Date(m.dataHora).toLocaleString('pt-BR')}</td>
                <td><b style="color:${m.tipo === 'Sangria' ? 'red' : 'green'}">${m.tipo}</b></td>
                <td>R$ ${m.valor.toFixed(2)}</td>
                <td>${m.justificativa}</td>
                <td>${m.usuario}</td>
            `;
            corpo.appendChild(tr);
        });
    }

    // ==========================================
    // RELATÓRIO 6: CONTAS A RECEBER
    // ==========================================
    else if (tipo === 'contas_receber') {
        titulo.textContent = `Relatório de Contas a Receber (Crédito Loja ativo)`;
        colunas.innerHTML = `<th>Cliente</th><th>Data Lançamento</th><th>Valor do Débito</th><th>Status</th>`;
        
        corpo.innerHTML = '';
        if (recSnap.exists()) {
            const list = filtrarPorData(Object.values(recSnap.val()), 'dataLancamento');
            list.forEach(r => {
                const cliDados = clientes[r.clienteId] || { nome: "Cliente Excluído" };
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${cliDados.nome}</td>
                    <td>${new Date(r.dataLancamento).toLocaleString('pt-BR')}</td>
                    <td>R$ ${r.valor.toFixed(2)}</td>
                    <td><b style="color:${r.status === 'Aberto' ? 'red' : 'blue'}">${r.status}</b></td>
                `;
                corpo.appendChild(tr);
            });
        }
    }

    // ==========================================
    // RELATÓRIO 7: AUDITORIA DE ESTOQUE
    // ==========================================
    else if (tipo === 'auditoria_estoque') {
        titulo.textContent = `Trilha de Auditoria de Ajustes Manuais de Estoque`;
        colunas.innerHTML = `<th>Data/Hora</th><th>Produto</th><th>Qtd Movimentada</th><th>Operação</th><th>Justificativa</th><th>Usuário</th>`;
        
        corpo.innerHTML = '';
        if (movSnap.exists()) {
            const list = filtrarPorData(Object.values(movSnap.val()), 'dataHora');
            list.sort((a,b) => new Date(b.dataHora) - new Date(a.dataHora));

            list.forEach(m => {
                const prodDados = produtos[m.produtoId] || { descricao: "Produto Removido" };
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${new Date(m.dataHora).toLocaleString('pt-BR')}</td>
                    <td>${prodDados.descricao}</td>
                    <td>${m.quantidade}</td>
                    <td><b>${m.tipo}</b></td>
                    <td>${m.motivo}</td>
                    <td>${m.usuario}</td>
                `;
                corpo.appendChild(tr);
            });
        }
    }
}

