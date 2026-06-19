import { db, ref, push, set, get, update } from './firebase-config.js';
import { dispararMensagemWhatsApp } from './whatsapp.js';
import { imprimirComprovante } from './impressora.js';

const formCliente = document.getElementById('form-cliente');
const btnCancelar = document.getElementById('btn-cancelar');
const formTitulo = document.getElementById('form-titulo');

formCliente.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('cliente-id').value;
    const clienteData = {
        nome: document.getElementById('cliente-nome').value,
        cpf: document.getElementById('cliente-cpf').value || '',
        telefone: document.getElementById('cliente-telefone').value,
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
            const botaoZap = saldoDevedor > 0 ? `<button class="btn btn-sm btn-outline-success btn-zap" data-id="${id}">💬 Cobrar</button>` : '<span class="text-muted small">Em dia</span>';
            
            tr.innerHTML = `
                <td>${c.nome}</td><td><code>${c.cpf || '---'}</code></td><td>${c.telefone}</td>
                <td><small class="text-muted">${c.rua || ''}</small></td><td><span class="badge bg-secondary">${c.tipo}</span></td>
                <td>R$ ${parseFloat(c.limiteCredito).toFixed(2)}</td>
                <td><strong class="${saldoDevedor > 0 ? 'text-danger' : 'text-success'}">R$ ${parseFloat(saldoDevedor).toFixed(2)}</strong></td>
                <td>
                    <button class="btn btn-sm btn-warning btn-editar" data-id="${id}">Editar</button>
                    <button class="btn btn-sm btn-info btn-extrato" data-id="${id}" data-nome="${c.nome}">Extrato</button>
                </td>
                <td>${botaoZap}</td>`;
            tabela.appendChild(tr);
        }
        document.querySelectorAll('.btn-editar').forEach(b => b.addEventListener('click', () => carregarClienteParaEdicao(b.getAttribute('data-id'))));
        document.querySelectorAll('.btn-zap').forEach(b => b.addEventListener('click', () => enviarMensagemCobranca(b.getAttribute('data-id'))));
        document.querySelectorAll('.btn-extrato').forEach(b => b.addEventListener('click', () => abrirExtratoCliente(b.getAttribute('data-id'), b.getAttribute('data-nome'))));
    }
}

async function buscarHistoricoComprasCliente(clienteId) {
    const vendasSnap = await get(ref(db, 'vendas'));
    if (!vendasSnap.exists()) return [];
    const historico = [];
    Object.values(vendasSnap.val()).forEach(v => {
        if (v.clienteId === clienteId) historico.push(v);
    });
    return historico.sort((a, b) => new Date(b.dataHora) - new Date(a.dataHora));
}

window.imprimirExtrato = async (clienteId, nomeCliente) => {
    const historico = await buscarHistoricoComprasCliente(clienteId);
    const snapCliente = await get(ref(db, 'clientes/' + clienteId));
    const saldo = snapCliente.exists() ? (snapCliente.val().saldoDevedor || 0) : 0;
    
    let itensHtml = historico.map(v => `<div style="display: flex; justify-content: space-between;"><span>${new Date(v.dataHora).toLocaleDateString('pt-BR')}</span><span>R$ ${v.total.toFixed(2)}</span></div>`).join('');
    
    const corpoExtrato = `<div style="font-family: Arial; font-size: 12px;"><h4>EXTRATO: ${nomeCliente}</h4><hr>${itensHtml}<hr><p><strong>SALDO DEVEDOR: R$ ${saldo.toFixed(2)}</strong></p><br><br><div style="text-align:center">____________________<br>Assinatura</div></div>`;
    imprimirComprovante("EXTRATO CLIENTE", corpoExtrato);
};

async function abrirExtratoCliente(id, nome) {
    const historico = await buscarHistoricoComprasCliente(id);
    let html = `<ul class="list-group">`;
    historico.forEach(v => html += `<li class="list-group-item">${new Date(v.dataHora).toLocaleDateString()} - R$ ${v.total.toFixed(2)}</li>`);
    html += `</ul><button class="btn btn-primary w-100 mt-3" onclick="imprimirExtrato('${id}', '${nome}')">🖨️ Imprimir Extrato</button>`;
    document.getElementById('conteudo-modal-extrato').innerHTML = html;
    new bootstrap.Modal(document.getElementById('modal-extrato')).show();
}

async function carregarClienteParaEdicao(id) {
    const s = await get(ref(db, 'clientes/' + id));
    if (s.exists()) {
        const c = s.val();
        document.getElementById('cliente-id').value = id;
        document.getElementById('cliente-nome').value = c.nome;
        document.getElementById('cliente-telefone').value = c.telefone;
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
        
        // Limite disponível é o total cadastrado menos o que o cliente já deve
        const limiteDisponivel = Math.max(0, limiteTotal - saldoDevedor);

        const textoMensagem = `Sr(a). ${nome},\n\n` +
            `📌 *Saldo em aberto:* R$ ${saldoDevedor.toFixed(2)}\n` +
            `📈 *Limite disponível:* R$ ${limiteDisponivel.toFixed(2)}\n\n` +
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
