import { db, ref, get, update } from './firebase-config.js';
import { imprimirComprovante } from './impressora.js';
import { $, fmtMoney, fmtDateBR, setHTML } from './utils.js';

const tabelaVendas = $('tabela-vendas');

async function renderizarTabelaVendas() {
    if (!tabelaVendas) return;
    const snap = await get(ref(db, 'vendas'));
    if (!snap.exists()) {
        tabelaVendas.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Nenhuma venda registrada</td></tr>';
        return;
    }

    const vendas = snap.val();
    tabelaVendas.innerHTML = '';

    Object.entries(vendas)
        .sort((a, b) => new Date(b[1].dataHora) - new Date(a[1].dataHora))
        .forEach(([id, v]) => {
            const status = v.cancelado ? '<span class="badge bg-danger">Cancelada</span>' : (v.ativo === false ? '<span class="badge bg-secondary">Inativa</span>' : '<span class="badge bg-success">Ativa</span>');
            const itensResumo = v.itens ? v.itens.map(i => `${i.nome} x${i.qtd}`).join(', ') : '—';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><small>${id}</small></td>
                <td>${fmtDateBR(v.dataHora)}</td>
                <td>${v.clienteNome || 'Consumidor'}</td>
                <td>${itensResumo}</td>
                <td class="text-end">${fmtMoney(v.total)}</td>
                <td>${v.formaPagamento || v.formaPgto || ''}</td>
                <td>${status}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary btn-detalhes" data-id="${id}">Ver</button>
                    <button class="btn btn-sm btn-outline-success btn-cupom" data-id="${id}">Cupom</button>
                    <button class="btn btn-sm btn-outline-info btn-trocar" data-id="${id}">Trocar Cliente</button>
                    <button class="btn btn-sm btn-outline-danger btn-cancelar" data-id="${id}">Cancelar</button>
                </td>
            `;
            tabelaVendas.appendChild(tr);
        });

    document.querySelectorAll('.btn-detalhes').forEach(b => b.addEventListener('click', () => abrirDetalhesVenda(b.getAttribute('data-id'))));
    document.querySelectorAll('.btn-cupom').forEach(b => b.addEventListener('click', () => emitirCupom(b.getAttribute('data-id'))));
    document.querySelectorAll('.btn-trocar').forEach(b => b.addEventListener('click', () => abrirModalTrocarCliente(b.getAttribute('data-id'))));
    document.querySelectorAll('.btn-cancelar').forEach(b => b.addEventListener('click', () => confirmarCancelarVenda(b.getAttribute('data-id'))));
}

async function abrirDetalhesVenda(id) {
    const s = await get(ref(db, 'vendas/' + id));
    if (!s.exists()) return;
    const v = s.val();

    let itensHtml = '';
    if (v.itens) itensHtml = v.itens.map(i => `<div style="display:flex; justify-content:space-between"><div>${i.nome} x${i.qtd}</div><div>${fmtMoney(i.preco)}</div></div>`).join('');

    const corpo = `
        <p><strong>Venda:</strong> ${id}</p>
        <p><strong>Cliente:</strong> ${v.clienteNome || 'Consumidor'}</p>
        <p><strong>Data:</strong> ${fmtDateBR(v.dataHora)}</p>
        <hr>
        ${itensHtml}
        <hr>
        <p class="text-end"><strong>Total: ${fmtMoney(v.total)}</strong></p>
    `;

    setHTML('conteudo-modal-detalhes', corpo);
    new bootstrap.Modal($("modal-detalhes-venda")).show();
}

async function emitirCupom(id) {
    const s = await get(ref(db, 'vendas/' + id));
    if (!s.exists()) return;
    const v = s.val();

    let itensHtml = '';
    if (v.itens) itensHtml = v.itens.map(i => `<div style="display:flex; justify-content:space-between"><span>${i.nome} x${i.qtd}</span><span>${fmtMoney(i.preco)}</span></div>`).join('');

    const corpo = `
        <div style="font-family:monospace; font-size:12px;">
            <h4 style="text-align:center;">CUPOM FISCAL</h4>
            <p>Venda: ${id}</p>
            <p>Cliente: ${v.clienteNome || 'Consumidor'}</p>
            <hr>
            ${itensHtml}
            <hr>
            <div style="display:flex; justify-content:space-between; font-weight:bold;"><span>Total</span><span>${fmtMoney(v.total)}</span></div>
        </div>
    `;

    imprimirComprovante('CUPOM DE VENDA', corpo);
}

function abrirModalTrocarCliente(id) {
    $('trocar-venda-id').value = id;
    carregarClientesParaSelecao();
    new bootstrap.Modal($('modal-trocar-cliente')).show();
}

async function carregarClientesParaSelecao() {
    const sel = $('select-clientes-venda');
    sel.innerHTML = '';
    const snap = await get(ref(db, 'clientes'));
    if (!snap.exists()) {
        sel.innerHTML = '<option value="">Nenhum cliente</option>';
        return;
    }
    const clientes = snap.val();
    Object.entries(clientes).forEach(([id, c]) => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.text = c.nome + (c.cpf ? ' - ' + c.cpf : '');
        sel.appendChild(opt);
    });
}

document.getElementById('btn-confirm-trocar-cliente').addEventListener('click', async () => {
    const vendaId = $('trocar-venda-id').value;
    const novoId = $('select-clientes-venda').value;
    if (!novoId) return window.mostrarAlertaSistema('Selecione um cliente válido');
    const s = await get(ref(db, 'clientes/' + novoId));
    if (!s.exists()) return window.mostrarAlertaSistema('Cliente não encontrado');
    const c = s.val();
    await update(ref(db, 'vendas/' + vendaId), { clienteId: novoId, clienteNome: c.nome });
    new bootstrap.Modal($('modal-trocar-cliente')).hide();
    renderizarTabelaVendas();
    window.mostrarAlertaSistema('Cliente atualizado na venda');
});

function confirmarCancelarVenda(id) {
    window.mostrarConfirmacaoSistema('Deseja cancelar (soft-delete) esta venda?', async () => {
        await cancelarVenda(id);
        renderizarTabelaVendas();
        window.mostrarAlertaSistema('Venda cancelada (soft-delete)');
    });
}

async function cancelarVenda(id) {
    await update(ref(db, 'vendas/' + id), { cancelado: true, ativo: false, canceladoEm: new Date().toISOString() });
}

renderizarTabelaVendas();
