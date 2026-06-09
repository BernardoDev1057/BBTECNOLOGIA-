import { db, auth, ref, push, set, get, update } from './firebase-config.js';

let listaClientesMemoria = {};
let caixaAtivoId = null;

// Prevenção logística: Garante que o operador abriu o caixa antes de receber dinheiro de dívida
async function verificarCaixaParaRecebimento() {
    if (!auth.currentUser) return;
    const snapshot = await get(ref(db, 'caixas'));
    if (snapshot.exists()) {
        for (let id in snapshot.val()) {
            const cx = snapshot.val()[id];
            if (cx.operador === auth.currentUser.email && cx.status === 'Aberto') {
                caixaAtivoId = id;
                return;
            }
        }
    }
}

// Carrega a listagem de clientes em cache para o sistema de busca rápida
async function carregarClientesCache() {
    const cliSnap = await get(ref(db, 'clientes'));
    if (cliSnap.exists()) listaClientesMemoria = cliSnap.val();
}

// Mecanismo de busca preditiva por digitação
document.getElementById('contas-busca-cliente').addEventListener('input', (e) => {
    const termo = e.target.value.toLowerCase().trim();
    const divResultados = document.getElementById('lista-busca-cliente');
    divResultados.innerHTML = '';

    if (!termo) { divResultados.style.display = 'none'; return; }

    let filtrados = 0;
    Object.entries(listaClientesMemoria).forEach(([id, c]) => {
        if (c.nome.toLowerCase().includes(termo)) {
            if (filtrados++ > 5) return;
            const item = document.createElement('div');
            item.className = 'busca-item';
            item.textContent = `${c.nome} - Dívida Total: R$ ${(c.saldoDevedor || 0).toFixed(2)}`;
            item.addEventListener('click', () => {
                document.getElementById('contas-busca-cliente').value = c.nome;
                document.getElementById('contas-cliente-id').value = id;
                divResultados.style.display = 'none';
                carregarHistoricoTitulos(id);
            });
            divResultados.appendChild(item);
        }
    });
    divResultados.style.display = filtrados > 0 ? 'block' : 'none';
});

// Busca e renderiza o histórico do cliente selecionado (Abertos e Pagos)
async function carregarHistoricoTitulos(clienteId) {
    const tbody = document.getElementById('tabela-historico-contas');
    tbody.innerHTML = "<tr><td colspan='5' style='text-align:center;'>Processando histórico...</td></tr>";

    const recSnap = await get(ref(db, 'contasReceber'));
    tbody.innerHTML = '';

    if (recSnap.exists()) {
        let titulosEncontrados = [];
        Object.entries(recSnap.val()).forEach(([id, r]) => {
            if (r.clienteId === clienteId) titulosEncontrados.push({ id, ...r });
        });

        // Ordena do mais recente para o mais antigo
        titulosEncontrados.sort((a, b) => new Date(b.dataLancamento) - new Date(a.dataLancamento));

        if (titulosEncontrados.length === 0) {
            tbody.innerHTML = "<tr><td colspan='5' style='text-align:center;'>Nenhum histórico de Crédito Loja encontrado para este cliente.</td></tr>";
            return;
        }

        titulosEncontrados.forEach(t => {
            const tr = document.createElement('tr');
            
            const txtStatus = t.status === 'Pago' 
                ? `<span class="status-pago">✓ Pago</span>` 
                : `<span class="status-aberto">⚠️ Em Aberto</span>`;
                
            const dataPagamento = t.dataPagamento ? new Date(t.dataPagamento).toLocaleString('pt-BR') : '-';
            
            const botaoAcao = t.status === 'Aberto' 
                ? `<button class="btn-pagar" onclick="window.quitarTitulo('${t.id}', ${t.valor}, '${clienteId}')">Baixar Pagamento</button>` 
                : `<span style="color:#666; font-size:12px;">Título Liquidado</span>`;

            tr.innerHTML = `
                <td>${new Date(t.dataLancamento).toLocaleString('pt-BR')}</td>
                <td>R$ ${t.valor.toFixed(2)}</td>
                <td>${txtStatus}</td>
                <td>${dataPagamento}</td>
                <td>${botaoAcao}</td>
            `;
            tbody.appendChild(tr);
        });
    } else {
        tbody.innerHTML = "<tr><td colspan='5' style='text-align:center;'>Nenhum registro de contas encontrado no sistema.</td></tr>";
    }
}

// Função de Quitação de Dívidas (Baixa do Título)
window.quitarTitulo = async (tituloId, valor, clienteId) => {
    if (!caixaAtivoId) {
        alert("ERRO LOGÍSTICO: Você não pode receber pagamentos sem ter um CAIXA ABERTO em seu turno! Abra o caixa primeiro.");
        return;
    }

    const conf = confirm(`Confirmar o recebimento em dinheiro/PIX do valor de R$ ${valor.toFixed(2)}?`);
    if (!conf) return;

    // 1. Atualiza o status do Título específico para Pago
    await update(ref(db, `contasReceber/${tituloId}`), {
        status: 'Pago',
        dataPagamento: new Date().toISOString()
    });

    // 2. Deduz o valor pago do Saldo Devedor Global do Cliente
    const cliSnap = await get(ref(db, `clientes/${clienteId}`));
    if (cliSnap.exists()) {
        const saldoAtual = cliSnap.val().saldoDevedor || 0;
        let novoSaldo = saldoAtual - valor;
        if (novoSaldo < 0) novoSaldo = 0; // Proteção contra saldos negativos

        await update(ref(db, `clientes/${clienteId}`), { saldoDevedor: novoSaldo });
    }

    // 3. Injeta a entrada do dinheiro como Suprimento de Recebimento no caixa ativo do operador
    await set(push(ref(db, 'suprimentos')), {
        caixaId: caixaAtivoId,
        valor: valor,
        justificativa: `Recebimento de Crédito Loja - Cliente: ${listaClientesMemoria[clienteId].nome}`,
        usuario: auth.currentUser.email,
        dataHora: new Date().toISOString()
    });

    alert("Pagamento processado e baixado com sucesso!");
    
    // Atualiza a tela e recarrega os caches
    await carregarClientesCache();
    carregarHistoricoTitulos(clienteId);
};

// Inicialização imediata com verificação de segurança
setTimeout(() => {
    verificarCaixaParaRecebimento();
    carregarClientesCache();
}, 1500);

