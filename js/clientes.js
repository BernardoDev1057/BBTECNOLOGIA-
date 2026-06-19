import { db, ref, push, set, get, update } from './firebase-config.js';
import { dispararMensagemWhatsApp } from './whatsapp.js';
import { imprimirComprovante } from './impressora.js';

const formCliente = document.getElementById('form-cliente');
const btnCancelar = document.getElementById('btn-cancelar');
const formTitulo = document.getElementById('form-titulo');
const inputCpf = document.getElementById('cliente-cpf');
const inputTel = document.getElementById('cliente-telefone');

// MÁSCARAS
function mascaraCPF(valor) {
    return valor
        .replace(/\D/g, '')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function mascaraTelefone(valor) {
    valor = valor.replace(/\D/g, '');
    if (valor.length <= 10) {
        return valor.replace(/(\d{2})(\d)/, '($1) $2')
                   .replace(/(\d{4})(\d)/, '$1-$2');
    }
    return valor.replace(/(\d{2})(\d)/, '($1) $2')
               .replace(/(\d{5})(\d)/, '$1-$2');
}

inputCpf.addEventListener('input', (e) => {
    e.target.value = mascaraCPF(e.target.value);
});

inputTel.addEventListener('input', (e) => {
    e.target.value = mascaraTelefone(e.target.value);
});

formCliente.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('cliente-id').value;
    
    // Limpa máscara antes de salvar no Firebase
    const cpfLimpo = inputCpf.value.replace(/\D/g, '');
    const telLimpo = inputTel.value.replace(/\D/g, '');

    const clienteData = {
        nome: document.getElementById('cliente-nome').value,
        cpf: cpfLimpo,
        telefone: telLimpo,
        rua: document.getElementById('cliente-rua').value || '',
        bairro: document.getElementById('cliente-bairro').value || '',
        cidade: document.getElementById('cliente-cidade').value || '',
        tipo: document.getElementById('cliente-tipo').value,
        limiteCredito: parseFloat(document.getElementById('cliente-limite').value) || 0
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
    const tabela = document.getElementById('tabela-clientes');
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
            
            const cpfFormatado = c.cpf ? mascaraCPF(c.cpf) : '---';
            const telFormatado = c.telefone ? mascaraTelefone(c.telefone) : '---';

            tr.innerHTML = `
                <td>${c.nome}</td>
                <td><code>${cpfFormatado}</code></td>
                <td>${telFormatado}</td>
                <td><small class="text-muted">${endereco}</small></td>
                <td><span class="badge bg-secondary">${c.tipo}</span></td>
                <td>R$ ${parseFloat(c.limiteCredito).toFixed(2)}</td>
                <td><strong class="${saldoDevedor > 0? 'text-danger' : 'text-success'}">R$ ${parseFloat(saldoDevedor).toFixed(2)}</strong></td>
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
        const data = new Date(v.dataHora).toLocaleDateString('pt-BR');
        return `<div style="display: flex; justify-content: space-between; margin: 3px 0;">
            <span>${data} - ${forma}</span>
            <span>R$ ${v.total.toFixed(2)}</span>
        </div>`;
    }).join('');

    const cpfFormatado = cliente.cpf ? mascaraCPF(cliente.cpf) : '---';
    const telFormatado = cliente.telefone ? mascaraTelefone(cliente.telefone) : '---';

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
            <p><strong>Limite de Crédito: R$ ${limite.toFixed(2)}</strong></p>
            <p><strong>SALDO DEVEDOR ATUAL: R$ ${saldo.toFixed(2)}</strong></p>
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
                <td>${new Date(v.dataHora).toLocaleDateString('pt-BR')}</td>
                <td>${forma}</td>
                <td class="text-end">R$ ${v.total.toFixed(2)}</td>
            </tr>`;
        });
    }
    html += `</tbody></table>
        <button class="btn btn-primary w-100 mt-3" onclick="imprimirExtrato('${id}', '${nome}')">🖨️ Imprimir Extrato Completo</button>`;
    
    document.getElementById('conteudo-modal-extrato').innerHTML = html;
    new bootstrap.Modal(document.getElementById('modal-extrato')).show();
}

async function carregarClienteParaEdicao(id) {
    const s = await get(ref(db, 'clientes/' + id));
    if (s.exists()) {
        const c = s.val();
        document.getElementById('cliente-id').value = id;
        document.getElementById('cliente-nome').value = c.nome;
        inputCpf.value = c.cpf ? mascaraCPF(c.cpf) : '';
        inputTel.value = c.telefone ? mascaraTelefone(c.telefone) : '';
        document.getElementById('cliente-rua').value = c.rua || '';
        document.getElementById('cliente-bairro').value = c.bairro || '';
        document.getElementById('cliente-cidade').value = c.cidade || '';
        document.getElementById('cliente-tipo').value = c.tipo || 'Cliente';
        document.getElementById('cliente-limite').value = c.limiteCredito || 0;

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
        const saldoDevedor = parseFloat(c.saldoDevedor) || 0;
        const limiteTotal = parseFloat(c.limiteCredito) || 0;
        const limiteDisponivel = Math.max(0, limiteTotal - saldoDevedor);

        const textoMensagem = `Sr(a). ${nome},\n\n` +
            `📌 *Saldo em aberto:* R$ ${saldoDevedor.toFixed(2)}\n` +
            `Para liquidação imediata via PIX ou pagamento em espécie, responda esta mensagem. Nossa equipe realizará a baixa na sua conta com total discrição.\n\n` +
            `Atenciosamente,`;

        dispararMensagemWhatsApp(c.telefone, textoMensagem);
    }
}

function resetarFormulario() {
    formCliente.reset();
    document.getElementById('cliente-id').value = '';
    formTitulo.innerText = 'Cadastrar Novo Cliente';
    btnCancelar.style.display = 'none';
}

btnCancelar.addEventListener('click', resetarFormulario);
renderizarTabelaClientes();
