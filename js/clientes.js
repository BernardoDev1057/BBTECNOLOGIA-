import { db, ref, push, set, get, update } from './firebase-config.js';
import { dispararMensagemWhatsApp } from './whatsapp.js'; // <-- Adicione esta linha

const formCliente = document.getElementById('form-cliente');
const tabelaClientes = document.getElementById('tabela-clientes-body');

formCliente.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('cliente-id').value;
    const clienteData = {
        nome: document.getElementById('nome').value,
        telefone: document.getElementById('telefone').value,
        documento: document.getElementById('documento').value,
        endereco: document.getElementById('endereco').value,
        tipo: document.getElementById('tipo').value,
        limiteCredito: parseFloat(document.getElementById('limiteCredito').value) || 0
    };

    if (id) {
        await update(ref(db, `clientes/${id}`), clienteData);
    } else {
        clienteData.saldoDevedor = 0;
        await set(push(ref(db, 'clientes')), clienteData);
    }

    formCliente.reset();
    document.getElementById('cliente-id').value = '';
    carregarClientes();
});

async function carregarClientes() {
    tabelaClientes.innerHTML = '';
    const snapshot = await get(ref(db, 'clientes'));
    
    if (snapshot.exists()) {
        const clientes = snapshot.val();
        for (let id in clientes) {
            const c = clientes[id];
            const saldoDevedor = c.saldoDevedor || 0;
            
            // Condicional: Só mostra o botão do WhatsApp se o cliente estiver devendo
            const botaoZap = saldoDevedor > 0 
                ? `<button class="btn-zap" data-id="${id}" style="background:#25d366; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">💬 Cobrar</button>` 
                : `<span style="color:#aaa; font-size:12px;">Em dia</span>`;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${c.nome}</td>
                <td>${c.telefone}</td>
                <td>${c.tipo}</td>
                <td>R$ ${c.limiteCredito.toFixed(2)}</td>
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

        // --- NOVA ATRIBUIÇÃO: Evento de clique para o botão de Cobrança ---
        document.querySelectorAll('.btn-zap').forEach(btn => {
            btn.addEventListener('click', () => enviarMensagemCobranca(btn.getAttribute('data-id')));
        });
    }
}

// Nova Função Interna: Dispara régua de cobrança amigável
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


async function editarCliente(id) {
    const snapshot = await get(ref(db, `clientes/${id}`));
    if (snapshot.exists()) {
        const c = snapshot.val();
        document.getElementById('cliente-id').value = id;
        document.getElementById('nome').value = c.nome;
        document.getElementById('telefone').value = c.telefone;
        document.getElementById('documento').value = c.documento || '';
        document.getElementById('endereco').value = c.endereco || '';
        document.getElementById('tipo').value = c.tipo;
        document.getElementById('limiteCredito').value = c.limiteCredito;
    }
}

carregarClientes();

