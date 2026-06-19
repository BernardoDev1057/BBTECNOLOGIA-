import { db, ref, push, set, get, update } from './firebase-config.js';
import { dispararMensagemWhatsApp } from './whatsapp.js';
import { imprimirComprovante } from './impressora.js';
import { $, formatCPF, formatPhone, sanitizeDigits, parseFloatSafe, fmtMoney, fmtDateBR } from './utils.js';

const formCliente = $('form-cliente');
const btnCancelar = $('btn-cancelar');
const formTitulo = $('form-titulo');
const inputCpf = $('cliente-cpf');
const inputTel = $('cliente-telefone');

inputCpf.addEventListener('input', (e) => {
    e.target.value = formatCPF(e.target.value);
});

inputTel.addEventListener('input', (e) => {
    e.target.value = formatPhone(e.target.value);
});

formCliente.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('cliente-id').value;
    
    // Limpa máscara antes de salvar no Firebase
    const cpfLimpo = sanitizeDigits(inputCpf.value);
    const telLimpo = sanitizeDigits(inputTel.value);

    const clienteData = {
        nome: $('cliente-nome').value,
        cpf: cpfLimpo,
        telefone: telLimpo,
        rua: $('cliente-rua').value || '',
        bairro: $('cliente-bairro').value || '',
        cidade: $('cliente-cidade').value || '',
        tipo: $('cliente-tipo').value,
        limiteCredito: parseFloatSafe($('cliente-limite').value)
    };

    if (id) {
        await update(ref(db, 'clientes/' + id), clienteData);
    } else {
        clienteData.saldoDevedor = 0;
        await set(push(ref(db, 'clientes')), clienteData);
    }
    resetarFormulario();
    renderizarTabelaClientes();
});

async function renderizarTabelaClientes() {
    const tabela = $('tabela-clientes');
    if (!tabela) return;
    tabela.innerHTML = '';
    const snapshot = await get(ref(db, 'clientes'));

    if (snapshot.exists()) {
        const clientes = snapshot.val();
        for (let id in clientes) {
            const c = clientes[id];
            const tr = document.createElement('tr');
            const saldoDevedor = c.saldoDevedor || 0;
            const botaoZap = saldoDevedor > 0
               ? `<button class="btn btn-sm btn-outline-success btn-zap" data-id="${id}">💬 Cobrar</button>`
                : '<span class="text-muted small">Em dia</span>';

            const endereco = `${c.rua || ''} - ${c.bairro || ''} - ${c.cidade || ''}`;
            
            const cpfFormatado = c.cpf ? formatCPF(c.cpf) : '---';
            const telFormatado = c.telefone ? formatPhone(c.telefone) : '---';

            tr.innerHTML = `
                <td>${c.nome}</td>
                <td><code>${cpfFormatado}</code></td>
                <td>${telFormatado}</td>
                <td><small class="text-muted">${endereco}</small></td>
                <td><span class="badge bg-secondary">${c.tipo}</span></td>
                <td>${fmtMoney(c.limiteCredito)}</td>
                <td><strong class="${saldoDevedor > 0 ? 'text-danger' : 'text-success'}">${fmtMoney(saldoDevedor)}</strong></td>
                <td>
                    <button class="btn btn-sm btn-warning btn-editar" data-id="${id}">Editar</button>
                    <button class="btn btn-sm btn-info btn-extrato" data-id="${id}" data-nome="${c.nome}">Extrato</button>
                </td>
                <td>${botaoZap}</td>
            `;
            tabela.appendChild(tr);
        }

        document.querySelectorAll('.btn-editar').forEach(b =>
            b.addEventListener('click', () => carregarClienteParaEdicao(b.getAttribute('data-id')))
        );
        document.querySelectorAll('.btn-zap').forEach(b =>
            b.addEventListener('click', () => enviarMensagemCobranca(b.getAttribute('data-id')))
        );
        document.querySelectorAll('.btn-extrato').forEach(b =>
            b.addEventListener('click', () => abrirExtratoCliente(b.getAttribute('data-id'), b.getAttribute('data-nome')))
        );
    }
}

// BUSCA TODAS AS COMPRAS DO CLIENTE - INDEPENDENTE DA FORMA DE PAGAMENTO
async function buscarHistoricoComprasCliente(clienteId) {
    const vendasSnap = await get(ref(db, 'vendas'));
    if (!vendasSnap.exists()) return [];
    const historico = [];
    
    Object.entries(vendasSnap.val()).forEach(([id, v]) => {
        // Puxa TODAS as vendas do cliente: fiado, dinheiro, cartão, pix, etc
        if (v.clienteId === clienteId) historico.push({id,...v});
    });
    
    return historico.sort((a, b) => new Date(b.dataHora) - new Date(a.dataHora));
}

window.imprimirExtrato = async (clienteId, nomeCliente) => {
    const historico = await buscarHistoricoComprasCliente(clienteId);
    const snapCliente = await get(ref(db, 'clientes/' + clienteId));
    const cliente = snapCliente.exists()? snapCliente.val() : {};
    const saldo = cliente.saldoDevedor || 0;
    const limite = cliente.limiteCredito || 0;

    let itensHtml = historico.map(v => {
        const forma = v.formaPagamento || v.formaPgto || 'Não informado';
        const data = fmtDateBR(v.dataHora);
        return `<div style="display: flex; justify-content: space-between; margin: 3px 0;">
            <span>${data} - ${forma}</span>
            <span>${fmtMoney(v.total)}</span>
        </div>`;
    }).join('');

    const cpfFormatado = cliente.cpf ? formatCPF(cliente.cpf) : '---';
    const telFormatado = cliente.telefone ? formatPhone(cliente.telefone) : '---';

    const corpoExtrato = `
        <div style="font-family: Arial; font-size: 12px;">
            <h4>EXTRATO COMPLETO: ${nomeCliente}</h4>
            <p>CPF: ${cpfFormatado} | Tel: ${telFormatado}</p>
            <hr>
            <div style="display: flex; justify-content: space-between; font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 3px;">
                <span>Data / Forma Pgto</span>
                <span>Valor</span>
            </div>
            ${itensHtml || '<p>Sem movimentações</p>'}
            <hr>
            <p><strong>Limite de Crédito: ${fmtMoney(limite)}</strong></p>
            <p><strong>SALDO DEVEDOR ATUAL: ${fmtMoney(saldo)}</strong></p>
            <small>*Saldo devedor = apenas compras fiadas não pagas</small>
            <br><br>
            <div style="text-align:center">____________________<br>Assinatura</div>
        </div>
    `;
    imprimirComprovante("EXTRATO CLIENTE", corpoExtrato);
};

async function abrirExtratoCliente(id, nome) {
    const historico = await buscarHistoricoComprasCliente(id);
    let html = `<table class="table table-sm">
        <thead><tr><th>Data</th><th>Forma Pgto</th><th class="text-end">Valor</th></tr></thead>
        <tbody>`;
    
    if (historico.length === 0) {
        html += `<tr><td colspan="3" class="text-center text-muted">Nenhuma compra registrada</td></tr>`;
    } else {
        historico.forEach(v => {
            const forma = v.formaPagamento || v.formaPgto || 'N/A';
            html += `<tr>
                <td>${fmtDateBR(v.dataHora)}</td>
                <td>${forma}</td>
                <td class="text-end">${fmtMoney(v.total)}</td>
            </tr>`;
        });
    }
    html += `</tbody></table>
        <button class="btn btn-primary w-100 mt-3" onclick="imprimirExtrato('${id}', '${nome}')">🖨️ Imprimir Extrato Completo</button>`;
    
    $('conteudo-modal-extrato').innerHTML = html;
    new bootstrap.Modal($('modal-extrato')).show();
}

async function carregarClienteParaEdicao(id) {
    const s = await get(ref(db, 'clientes/' + id));
    if (s.exists()) {
        const c = s.val();
        $('cliente-id').value = id;
        $('cliente-nome').value = c.nome;
        inputCpf.value = c.cpf ? formatCPF(c.cpf) : '';
        inputTel.value = c.telefone ? formatPhone(c.telefone) : '';
        $('cliente-rua').value = c.rua || '';
        $('cliente-bairro').value = c.bairro || '';
        $('cliente-cidade').value = c.cidade || '';
        $('cliente-tipo').value = c.tipo || 'Cliente';
        $('cliente-limite').value = c.limiteCredito || 0;

        formTitulo.innerText = 'Editando: ' + c.nome;
        btnCancelar.style.display = 'inline-block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

async function enviarMensagemCobranca(id) {
    const s = await get(ref(db, 'clientes/' + id));
    if (s.exists()) {
        const c = s.val();
        const nome = c.nome;
        const saldoDevedor = parseFloatSafe(c.saldoDevedor);
        const limiteTotal = parseFloatSafe(c.limiteCredito);
        const limiteDisponivel = Math.max(0, limiteTotal - saldoDevedor);

        const textoMensagem = `Sr(a). ${nome},\n\n` +
            `📌 *Saldo em aberto:* ${fmtMoney(saldoDevedor)}\n` +
            `Para liquidação imediata via PIX ou pagamento em espécie, responda esta mensagem. Nossa equipe realizará a baixa na sua conta com total discrição.\n\n` +
            `Atenciosamente,`;

        dispararMensagemWhatsApp(c.telefone, textoMensagem);
    }
}

function resetarFormulario() {
    formCliente.reset();
    $('cliente-id').value = '';
    formTitulo.innerText = 'Cadastrar Novo Cliente';
    btnCancelar.style.display = 'none';
}

btnCancelar.addEventListener('click', resetarFormulario);
renderizarTabelaClientes();
