import { db, ref, push, set, get, update } from './firebase-config.js';
import { dispararMensagemWhatsApp } from './whatsapp.js';

const formCliente = document.getElementById('form-cliente');
const btnCancelar = document.getElementById('btn-cancelar');
const formTitulo = document.getElementById('form-titulo');

// Evento de Gravação (Inclusão ou Edição)
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
        const novoClienteRef = push(ref(db, 'clientes'));
        await set(novoClienteRef, clienteData);
    }

    resetarFormulario();
    renderizarTabelaClientes();
});

// Busca dados do Firebase e popula a lista
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

            const cpfExibicao = c.cpf ? c.cpf : '---';
            const limite = c.limiteCredito ? parseFloat(c.limiteCredito).toFixed(2) : '0.00';
            const saldoDevedor = c.saldoDevedor || 0;
            const saldoExibicao = parseFloat(saldoDevedor).toFixed(2);
            
            let enderecoCompleto = 'Não informado';
            if (c.rua || c.bairro) {
                enderecoCompleto = c.rua + (c.bairro ? ', ' + c.bairro : '') + (c.cidade ? ' - ' + c.cidade : '');
            }

            // Condicional do botão do zap recuperado da sua versão original
            let botaoZap = '<span class="text-muted small">Em dia</span>';
            if (saldoDevedor > 0) {
                botaoZap = '<button class="btn btn-sm btn-outline-success btn-zap" data-id="' + id + '">💬 Cobrar</button>';
            }

            tr.innerHTML = '<td>' + c.nome + '</td>' +
                           '<td><code>' + cpfExibicao + '</code></td>' +
                           '<td>' + c.telefone + '</td>' +
                           '<td><small class="text-muted">' + enderecoCompleto + '</small></td>' +
                           '<td><span class="badge bg-secondary">' + c.tipo + '</span></td>' +
                           '<td>R$ ' + limite + '</td>' +
                           '<td><strong class="' + (saldoDevedor > 0 ? 'text-danger' : 'text-success') + '">R$ ' + saldoExibicao + '</strong></td>' +
                           '<td><button class="btn btn-sm btn-warning btn-editar" data-id="' + id + '">Editar</button></td>' +
                           '<td>' + botaoZap + '</td>';

            tabela.appendChild(tr);
        }

        // Evento dos botões dinâmicos de Edição
        document.querySelectorAll('.btn-editar').forEach(btn => {
            btn.addEventListener('click', () => carregarClienteParaEdicao(btn.getAttribute('data-id')));
        });

        // Evento dos botões dinâmicos de Cobrança (Função nativa do seu sistema)
        document.querySelectorAll('.btn-zap').forEach(btn => {
            btn.addEventListener('click', () => enviarMensagemCobranca(btn.getAttribute('data-id')));
        });
    } else {
        tabela.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-3">Nenhum cliente cadastrado.</td></tr>';
    }
}

// Resgata o registro selecionado e joga nos inputs
async function carregarClienteParaEdicao(id) {
    const snapshot = await get(ref(db, 'clientes/' + id));
    if (snapshot.exists()) {
        const c = snapshot.val();

        document.getElementById('cliente-id').value = id;
        document.getElementById('cliente-nome').value = c.nome;
        document.getElementById('cliente-cpf').value = c.cpf || '';
        document.getElementById('cliente-telefone').value = c.telefone;
        document.getElementById('cliente-rua').value = c.rua || '';
        document.getElementById('cliente-bairro').value = c.bairro || '';
        document.getElementById('cliente-cidade').value = c.cidade || '';
        document.getElementById('cliente-tipo').value = c.tipo;
        document.getElementById('cliente-limite').value = c.limiteCredito || 0;

        formTitulo.innerText = 'Editando Cadastro: ' + c.nome;
        btnCancelar.style.display = 'inline-block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// Envia a régua de cobrança customizada usando o arquivo whatsapp.js externo
async function enviarMensagemCobranca(id) {
    const snapshot = await get(ref(db, 'clientes/' + id));
    if (snapshot.exists()) {
        const c = snapshot.val();
        const saldo = c.saldoDevedor || 0;
        const limite = c.limiteCredito || 0;

        let msgCobranca = "Olá, *" + c.nome + "*! Tudo bem?  🌟\n\n";
        msgCobranca += "Passando para enviar o extrato atualizado da sua conta de *Crédito Confiança* na nossa loja.\n\n";
        msgCobranca += "📌 *Saldo Devedor Atual:* R$ " + parseFloat(saldo).toFixed(2) + "\n";
        msgCobranca += "📈 *Seu Limite de Crédito:* R$ " + parseFloat(limite).toFixed(2) + "\n\n";
        msgCobranca += "Caso queira realizar o pagamento via PIX ou dinheiro, entre em contato conosco por aqui para darmos a baixa na sua ficha. Obrigado pela parceria! 🤝";

        dispararMensagemWhatsApp(c.telefone, msgCobranca);
    }
}

function resetarFormulario() {
    formCliente.reset();
    document.getElementById('cliente-id').value = '';
    formTitulo.innerText = 'Cadastrar Novo Cliente';
    btnCancelar.style.display = 'none';
}

btnCancelar.addEventListener('click', resetarFormulario);

// Inicialização
renderizarTabelaClientes();

