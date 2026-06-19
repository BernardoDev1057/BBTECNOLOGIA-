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
            if (filtrados++ >= 5) return;
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

// BAIXA PARCIAL + FORMA DE PAGAMENTO
window.quitarTitulo = async (tituloId, valorTotal, clienteId) => {
    const cliente = listaClientesMemoria[clienteId];

    // Cria modal dinâmico se não existir
    let modal = document.getElementById('modal-baixa');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-baixa';
        modal.className = 'modal fade';
        modal.tabIndex = -1;
        modal.innerHTML = `
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Baixa de Título</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <p>Cliente: <b id="modal-cliente-nome"></b></p>
              <p>Valor do título: <b id="modal-valor-titulo"></b></p>
              <p>Saldo devedor: <b id="modal-saldo-cliente"></b></p>

              <div class="mb-3">
                <label class="form-label">Valor a pagar</label>
                <input type="number" id="valor-baixa" class="form-control" step="0.01" min="0.01">
                <small class="text-muted" id="modal-max-valor"></small>
              </div>

              <div class="mb-3">
                <label class="form-label">Forma de Pagamento</label>
                <select id="forma-pagamento" class="form-select">
                  <option value="DINHEIRO">Dinheiro</option>
                  <option value="PIX">PIX</option>
                  <option value="CARTAO_DEBITO">Cartão Débito</option>
                  <option value="CARTAO_CREDITO">Cartão Crédito</option>
                  <option value="CREDITO_LOJA">Crédito Loja</option>
                </select>
              </div>

              <div class="mb-3">
                <label class="form-label">Observação</label>
                <input type="text" id="obs-baixa" class="form-control" placeholder="Opcional">
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="button" class="btn btn-success" id="btn-confirmar-baixa">Confirmar Baixa</button>
            </div>
          </div>
        </div>`;
        document.body.appendChild(modal);
    }

    // Preenche dados do modal
    document.getElementById('modal-cliente-nome').textContent = cliente.nome;
    document.getElementById('modal-valor-titulo').textContent = `R$ ${valorTotal.toFixed(2)}`;
    document.getElementById('modal-saldo-cliente').textContent = `R$ ${(cliente.saldoDevedor || 0).toFixed(2)}`;
    document.getElementById('valor-baixa').max = valorTotal;
    document.getElementById('valor-baixa').value = valorTotal.toFixed(2);
    document.getElementById('modal-max-valor').textContent = `Máximo: R$ ${valorTotal.toFixed(2)}`;

    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();

    document.getElementById('btn-confirmar-baixa').onclick = async () => {
        const valorPago = parseFloat(document.getElementById('valor-baixa').value);
        const formaPg = document.getElementById('forma-pagamento').value;
        const obs = document.getElementById('obs-baixa').value.trim();
        const usuario = auth.currentUser.email;

        if (isNaN(valorPago) || valorPago <= 0) {
            window.mostrarAlertaSistema("Valor inválido", "Erro");
            return;
        }
        if (valorPago > valorTotal + 0.01) {
            window.mostrarAlertaSistema("Valor maior que o título", "Erro");
            return;
        }

        bsModal.hide();

        const dataPagamento = new Date().toISOString();
        const saldoAnterior = cliente.saldoDevedor || 0;
        const novoSaldo = Math.max(0, saldoAnterior - valorPago);
        const saldoRestanteTitulo = valorTotal - valorPago;

        // 1. Se pagou tudo: marca como Pago. Se parcial: reduz valor e cria registro de pagamento
        if (saldoRestanteTitulo <= 0.01) {
            await update(ref(db, `contasReceber/${tituloId}`), {
                status: 'Pago',
                dataPagamento: dataPagamento,
                valorPago: valorPago,
                formaPagamento: formaPg,
                observacao: obs,
                usuarioBaixa: usuario
            });
        } else {
            // Baixa parcial: atualiza valor do título atual
            await update(ref(db, `contasReceber/${tituloId}`), {
                valor: parseFloat(saldoRestanteTitulo.toFixed(2)),
                observacao: `Baixa parcial de R$ ${valorPago.toFixed(2)} via ${formaPg} em ${new Date().toLocaleDateString('pt-BR')}. ${obs}`
            });

            // Cria registro de pagamento para histórico
            const novoPagamento = {
                clienteId: clienteId,
                clienteNome: cliente.nome,
                dataLancamento: dataPagamento,
                dataVencimento: (await get(ref(db, `contasReceber/${tituloId}/dataVencimento`))).val(),
                status: 'Pago',
                valor: valorPago,
                valorPago: valorPago,
                formaPagamento: formaPg,
                observacao: `Baixa parcial do título ${tituloId}. ${obs}`,
                dataPagamento: dataPagamento,
                usuarioBaixa: usuario,
                cancelado: false,
                tituloOrigem: tituloId
            };
            await push(ref(db, 'contasReceber'), novoPagamento);
        }

        // 2. Atualiza saldo do cliente
        await update(ref(db, `clientes/${clienteId}`), { saldoDevedor: parseFloat(novoSaldo.toFixed(2)) });

        window.mostrarAlertaSistema(`Baixa de R$ ${valorPago.toFixed(2)} realizada!`, "Sucesso");

        // 3. WhatsApp
        if (cliente.telefone) {
            const msg = `Olá ${cliente.nome}!\n\nRecebemos R$ ${valorPago.toFixed(2)} via ${formaPg}.\nData: ${new Date(dataPagamento).toLocaleString('pt-BR')}\nSaldo devedor restante: R$ ${novoSaldo.toFixed(2)}\n\nObrigado pela preferência!`;
            dispararMensagemWhatsApp(cliente.telefone, msg);
        }

        await carregarClientesCache();
        carregarHistoricoTitulos(clienteId);
    };
};

// SOFT DELETE / ESTORNO
window.estornarBaixa = async (tituloId, valor, clienteId) => {
    window.mostrarConfirmacaoSistema(`Estornar esta baixa? O título voltará para "Em Aberto" e o saldo será restaurado.`, async () => {
        const cliente = listaClientesMemoria[clienteId];
        const saldoAtual = cliente.saldoDevedor || 0;

        await update(ref(db, `contasReceber/${tituloId}`), {
            status: 'Aberto',
            dataPagamento: null,
            valorPago: null,
            formaPagamento: null,
            cancelado: true,
            motivoCancelamento: 'Estorno de baixa',
            usuarioEstorno: auth.currentUser.email,
            dataEstorno: new Date().toISOString()
        });

        await update(ref(db, `clientes/${clienteId}`), { saldoDevedor: parseFloat((saldoAtual + valor).toFixed(2)) });

        window.mostrarAlertaSistema("Baixa estornada com sucesso!", "Sucesso");
        await carregarClientesCache();
        carregarHistoricoTitulos(clienteId);
    });
};

// GERA COMPROVANTE usando impressora.js
window.gerarComprovante = async (tituloId) => {
    const snap = await get(ref(db, `contasReceber/${tituloId}`));
    if (!snap.exists()) return;
    const t = snap.val();
    const cliente = listaClientesMemoria[t.clienteId];

    const formaPg = t.formaPagamento? t.formaPagamento.replace('_', ' ') : 'N/I';
    const valorPago = t.valorPago || t.valor;

    const corpo = `
        <p>Cliente: ${cliente.nome}</p>
        <p>Data Lançamento: ${new Date(t.dataLancamento).toLocaleString('pt-BR')}</p>
        <p>Data Pagamento: ${new Date(t.dataPagamento).toLocaleString('pt-BR')}</p>
        <p>Forma Pagamento: ${formaPg}</p>
        <p>Valor Pago: R$ ${valorPago.toFixed(2)}</p>
        <p>Saldo Devedor Atual: R$ ${(cliente.saldoDevedor).toFixed(2)}</p>
        <p>Operador: ${t.usuarioBaixa}</p>
        ${t.observacao? `<p>Obs: ${t.observacao}</p>` : ''}
    `;

    imprimirComprovante('Comprovante de Baixa - Crédito Loja', corpo);
};

// Inicialização baseada em eventos nativos do ciclo do DOM
document.addEventListener('DOMContentLoaded', () => {
    carregarClientesCache();
});
