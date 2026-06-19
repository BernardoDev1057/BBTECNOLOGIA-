import { db, auth, ref, push, set, get, update } from './firebase-config.js';
import { imprimirComprovante } from './impressora.js';
import { dispararMensagemWhatsApp } from './whatsapp.js';

let listaClientesMemoria = {};
let clienteAtualId = null;

// Carrega clientes em cache
async function carregarClientesCache() {
    const cliSnap = await get(ref(db, 'clientes'));
    if (cliSnap.exists()) listaClientesMemoria = cliSnap.val();
}

// Busca preditiva só depois de 3 caracteres
document.getElementById('contas-busca-cliente').addEventListener('input', (e) => {
    const termo = e.target.value.toLowerCase().trim();
    const divResultados = document.getElementById('lista-busca-cliente');
    divResultados.innerHTML = '';

    if (termo.length < 3) {
        divResultados.style.display = 'none';
        return;
    }

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
                clienteAtualId = id;
                divResultados.style.display = 'none';
                carregarHistoricoTitulos(id);
            });
            divResultados.appendChild(item);
        }
    });
    divResultados.style.display = filtrados > 0? 'block' : 'none';
});

// Esconde busca ao clicar fora
document.addEventListener('click', (e) => {
    if (!e.target.closest('.position-relative')) {
        document.getElementById('lista-busca-cliente').style.display = 'none';
    }
});

// Checkbox para mostrar cancelados
document.getElementById('chk-mostrar-cancelados').addEventListener('change', () => {
    if (clienteAtualId) carregarHistoricoTitulos(clienteAtualId);
});

// Renderiza histórico
async function carregarHistoricoTitulos(clienteId) {
    clienteAtualId = clienteId;
    const tbody = document.getElementById('tabela-historico-contas');
    const mostrarCancelados = document.getElementById('chk-mostrar-cancelados').checked;

    tbody.innerHTML = "<tr><td colspan='5' class='text-center'>Processando histórico...</td></tr>";

    const recSnap = await get(ref(db, 'contasReceber'));
    tbody.innerHTML = '';

    if (recSnap.exists()) {
        let titulosEncontrados = [];
        Object.entries(recSnap.val()).forEach(([id, r]) => {
            if (r.clienteId === clienteId) {
                // Se não mostrar cancelados, filtra eles
                if (!mostrarCancelados && r.cancelado) return;
                titulosEncontrados.push({ id,...r });
            }
        });

        titulosEncontrados.sort((a, b) => new Date(b.dataLancamento) - new Date(a.dataLancamento));

        if (titulosEncontrados.length === 0) {
            tbody.innerHTML = "<tr><td colspan='5' class='text-center text-muted'>Nenhum título encontrado.</td></tr>";
            return;
        }

        titulosEncontrados.forEach(t => {
            const tr = document.createElement('tr');

            // Se for cancelado, deixa a linha apagada
            if (t.cancelado) tr.classList.add('table-secondary');

            let txtStatus = '';
            if (t.cancelado) {
                txtStatus = `<span class="badge bg-secondary">✗ Cancelado</span>`;
            } else if (t.status === 'Pago') {
                txtStatus = `<span class="badge bg-success">✓ Pago</span>`;
            } else {
                txtStatus = `<span class="badge bg-warning text-dark">⚠️ Em Aberto</span>`;
            }

            const dataPagamento = t.dataPagamento? new Date(t.dataPagamento).toLocaleString('pt-BR') : '-';

            let botaoAcao = '';
            if (t.status === 'Aberto' &&!t.cancelado) {
                botaoAcao = `<button class="btn btn-sm btn-success" onclick="window.quitarTitulo('${t.id}', ${t.valor}, '${clienteId}')">Baixar</button>`;
            } else if (t.status === 'Pago' &&!t.cancelado) {
                botaoAcao = `
                    <button class="btn btn-sm btn-outline-primary" onclick="window.gerarComprovante('${t.id}')">Comprovante</button>
                    <button class="btn btn-sm btn-outline-danger" onclick="window.estornarBaixa('${t.id}', ${t.valor}, '${clienteId}')">Estornar</button>
                `;
            } else if (t.cancelado) {
                botaoAcao = `<small class="text-muted">${t.motivoCancelamento || 'Cancelado'}</small>`;
            }

            tr.innerHTML = `
                <td>${new Date(t.dataLancamento).toLocaleString('pt-BR')}</td>
                <td>R$ ${t.valor.toFixed(2)}</td>
                <td>${txtStatus}</td>
                <td>${dataPagamento}</td>
                <td>${botaoAcao}</td>
            `;
            tbody.appendChild(tr);
        });
    }
}

// BAIXA - NÃO AFETA CAIXA
window.quitarTitulo = async (tituloId, valor, clienteId) => {
    const cliente = listaClientesMemoria[clienteId];
    const conf = confirm(`Confirmar baixa de R$ ${valor.toFixed(2)} para ${cliente.nome}?`);
    if (!conf) return;

    const dataPagamento = new Date().toISOString();
    const usuario = auth.currentUser.email;
    const saldoAnterior = cliente.saldoDevedor || 0;
    const novoSaldo = Math.max(0, saldoAnterior - valor);

    // 1. Marca título como Pago
    await update(ref(db, `contasReceber/${tituloId}`), {
        status: 'Pago',
        dataPagamento: dataPagamento,
        cancelado: false,
        usuarioBaixa: usuario
    });

    // 2. Atualiza saldo do cliente
    await update(ref(db, `clientes/${clienteId}`), { saldoDevedor: novoSaldo });

    alert("Baixa realizada com sucesso!");

    // 3. Gera comprovante
    gerarComprovante(tituloId);

    // 4. Envia WhatsApp
    if (cliente.telefone) {
        const msg = `Olá ${cliente.nome}!\n\nRecebemos o pagamento de R$ ${valor.toFixed(2)} referente ao seu débito.\nData: ${new Date(dataPagamento).toLocaleString('pt-BR')}\nSaldo devedor restante: R$ ${novoSaldo.toFixed(2)}\n\nObrigado pela preferência!`;
        dispararMensagemWhatsApp(cliente.telefone, msg);
    }

    await carregarClientesCache();
    carregarHistoricoTitulos(clienteId);
};

// SOFT DELETE / ESTORNO
window.estornarBaixa = async (tituloId, valor, clienteId) => {
    const conf = confirm(`Estornar esta baixa? O título voltará para "Em Aberto" e o saldo será restaurado.`);
    if (!conf) return;

    const cliente = listaClientesMemoria[clienteId];
    const saldoAtual = cliente.saldoDevedor || 0;

    await update(ref(db, `contasReceber/${tituloId}`), {
        status: 'Aberto',
        dataPagamento: null,
        cancelado: true,
        motivoCancelamento: 'Estorno de baixa',
        usuarioEstorno: auth.currentUser.email,
        dataEstorno: new Date().toISOString()
    });

    await update(ref(db, `clientes/${clienteId}`), { saldoDevedor: saldoAtual + valor });

    alert("Baixa estornada com sucesso!");
    await carregarClientesCache();
    carregarHistoricoTitulos(clienteId);
};

// GERA COMPROVANTE usando impressora.js
window.gerarComprovante = async (tituloId) => {
    const snap = await get(ref(db, `contasReceber/${tituloId}`));
    if (!snap.exists()) return;
    const t = snap.val();
    const cliente = listaClientesMemoria[t.clienteId];

    const corpo = `
        <p>Cliente: ${cliente.nome}</p>
        <p>Data Lançamento: ${new Date(t.dataLancamento).toLocaleString('pt-BR')}</p>
        <p>Data Pagamento: ${new Date(t.dataPagamento).toLocaleString('pt-BR')}</p>
        <p>Valor Pago: R$ ${t.valor.toFixed(2)}</p>
        <p>Saldo Devedor Atual: R$ ${(cliente.saldoDevedor).toFixed(2)}</p>
        <p>Operador: ${t.usuarioBaixa}</p>
    `;

    imprimirComprovante('Comprovante de Baixa - Crédito Loja', corpo);
};

// Init
setTimeout(() => {
    carregarClientesCache();
}, 1000);
