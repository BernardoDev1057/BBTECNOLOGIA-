import { db, ref, push, set, get, update } from './firebase-config.js';
import { dispararMensagemWhatsApp } from './whatsapp.js';

const formCliente = document.getElementById('form-cliente');

// Evento de salvamento / Edição do formulário
formCliente.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('cliente-id').value;
    
    // Captura corrigida usando os IDs exatos que estão no seu clientes.html
    const clienteData = {
        nome: document.getElementById('cliente-nome').value,
        telefone: document.getElementById('cliente-telefone').value,
        tipo: document.getElementById('cliente-tipo').value,
        limiteCredito: parseFloat(document.getElementById('cliente-limite').value) || 0
    };

    if (id) {
        await update(ref(db, `clientes/${id}`), clienteData);
        // Desliga o modo edição na interface
        document.getElementById('btn-cancelar').style.display = 'none';
        document.getElementById('form-titulo').textContent = 'Cadastrar Novo Cliente';
    } else {
        clienteData.saldoDevedor = 0;
        await set(push(ref(db, 'clientes')), clienteData);
    }

    formCliente.reset();
    document.getElementById('cliente-id').value = '';
    carregarClientes();
});

// Função para listar os clientes na tabela
async function carregarClientes() {
    // Captura o ID correto do clientes.html
    const tabelaClientes = document.getElementById('tabela-clientes');
    if (!tabelaClientes) return;

    tabelaClientes.innerHTML = '';
    const snapshot = await get(ref(db, 'clientes'));

    if (snapshot.exists()) {
        const clientes = snapshot.val();
        for (let id in clientes) {
            const c = clientes[id];
            const saldoDevedor = c.saldoDevedor || 0;

            // Condicional do botão do zap
            const botaoZap = saldoDevedor > 0
                ? `<button class="btn-zap" data-id="${id}" style="background:#25d366; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">💬 Cobrar</button>`
                : `<span style="color:#aaa; font-size:12px;">Em dia</span>`;

            // Criação da linha (tr) que estava faltando por causa do erro de colagem
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${c.nome}</td>
                <td>${c.telefone}</td>
                <td>${c.tipo}</td>
                <td>R$ ${(c.limiteCredito || 0).toFixed(2)}</td>
                <td>R$ ${saldoDevedor.toFixed(2)}</td>
                <td><button class="btn-edit" data-id="${id}">Editar</button></td>
                <td>${botaoZap}</td>
            `;

            tabelaClientes.appendChild(tr);
        }

        // Atribui evento nos botões dinâmicos de Edição
        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', () => editarCliente(btn.getAttribute('data-id')));
        });

        // Evento de clique para o botão de Cobrança
        document.querySelectorAll('.btn-zap').forEach(btn => {
            btn.addEventListener('click', () => enviarMensagemCobranca(btn.getAttribute('data-id')));
        });
    } else {
        tabelaClientes.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#999;">Nenhum cliente cadastrado.</td></tr>`;
    }
}

// Resgata os dados do Firebase e joga de volta no formulário para edição
async function editarCliente(id) {
    const snapshot = await get(ref(db, `clientes/${id}`));
    if (snapshot.exists()) {
        const c = snapshot.val();
        
        document.getElementById('cliente-id').value = id;
        document.getElementById('cliente-nome').value = c.nome;
        document.getElementById('cliente-telefone').value = c.telefone;
        document.getElementById('cliente-tipo').value = c.tipo;
        document.getElementById('cliente-limite').value = c.limiteCredito;

        // Muda estados visuais do formulário
        document.getElementById('form-titulo').textContent = 'Editando Cadastro de Cliente';
        document.getElementById('btn-cancelar').style.display = 'inline-block';
    }
}

// Função para cancelar a edição no meio do caminho
document.getElementById('btn-cancelar').addEventListener('click', () => {
    formCliente.reset();
    document.getElementById('cliente-id').value = '';
    document.getElementById('btn-cancelar').style.display = 'none';
    document.getElementById('form-titulo').textContent = 'Cadastrar Novo Cliente';
});

// Envia a régua de cobrança customizada
async function enviarMensagemCobranca(id) {
    const snapshot = await get(ref(db, `clientes/${id}`));
    if (snapshot.exists()) {
        const c = snapshot.val();

        let msgCobranca = `Olá, *${c.nome}*! Tudo bem? 🌟\n\n`;
        msgCobranca += `Passando para enviar o extrato atualizado da sua conta de *Crédito Confiança* na nossa loja.\n\n`;
        msgCobranca += `📌 *Saldo Devedor Atual:* R$ ${(c.saldoDevedor || 0).toFixed(2)}\n`;
        msgCobranca += `📈 *Seu Limite de Crédito:* R$ ${(c.limiteCredito || 0).toFixed(2)}\n\n`;
        msgCobranca += `Caso queira realizar o pagamento via PIX ou dinheiro, entre em contato conosco por aqui para darmos a baixa na sua ficha. Obrigado pela parceria! 🤝`;

        dispararMensagemWhatsApp(c.telefone, msgCobranca);
    }
}

// Inicializa a tabela ao carregar o arquivo
carregarClientes();

