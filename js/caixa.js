import {db, auth, ref, push, remove, set, get, update, onAuthStateChanged, } from "./firebase-config.js";
import { dispararMensagemWhatsApp } from "./whatsapp.js";
import { imprimirComprovante } from "./impressora.js";
import { $, fmtMoney, fmtDateBR, parseFloatSafe } from "./utils.js";

// Estados de Controle Globais do Turno
let caixaAtivoId = null;
let valorInicialTroco = 0;
let carrinho = [];
let totalVendaGlobal = 0;
// Variável global para rastrear se o carrinho veio de uma venda pendente recuperada
let pagamentosAdicionados = [];
let modalRecebInstancia = null;
let vendaPendenteEmEdicaoId = null;

// Referência rápida de elementos
const telaAbertura = document.getElementById("tela-abertura");
const telaPdv = document.getElementById("tela-pdv");
const navBtnSangria = document.getElementById("nav-btn-sangria");
const navBtnFechar = document.getElementById("nav-btn-fechar");
const barraAuxiliar = document.getElementById("barra-auxiliar-caixa");

// Dados locais
let listaProdutosMemoria = {};
let listaClientesMemoria = {};
let produtoSelecionadoId = null;

// ==========================================
// 1. GERENCIAMENTO DE ESTADO E FLUXO DO CAIXA
// ==========================================
onAuthStateChanged(auth, (user) => {
  if (user) {
    verificarFluxoCaixa();
  } else {
    telaAbertura.style.display = "block";
    telaPdv.style.display = "none";
    barraAuxiliar.style.display = "none";
  }
});

async function verificarFluxoCaixa() {
  const snapshot = await get(ref(db, "caixas"));
  let caixaAberto = false;

  if (snapshot.exists()) {
    Object.entries(snapshot.val()).forEach(([id, cx]) => {
      if (cx.operador === auth.currentUser.email && cx.status === "Aberto") {
        caixaAberto = true;
        caixaAtivoId = id;
        valorInicialTroco = cx.valorInicial || 0;
      }
    });
  }

  if (caixaAberto) {
    telaAbertura.style.display = "none";
    telaPdv.style.display = "grid";
    barraAuxiliar.style.display = "block";
    navBtnSangria.style.display = "inline-block";
    navBtnFechar.style.display = "inline-block";
    carregarDadosParaBusca();
  } else {
    telaAbertura.style.display = "block";
    telaPdv.style.display = "none";
    barraAuxiliar.style.display = "none";
    navBtnSangria.style.display = "none";
    navBtnFechar.style.display = "none";
  }
}

// Botão: Abrir Turno
document
  .getElementById("btn-confirmar-abertura")
  .addEventListener("click", async () => {
    const troco = parseFloatSafe($("caixa-troco-inicial").value);
    const novaRef = push(ref(db, "caixas"));

    await set(novaRef, {
      operador: auth.currentUser.email,
      dataHoraAbertura: new Date().toISOString(),
      valorInicial: troco,
      status: "Aberto",
    });

    caixaAtivoId = novaRef.key;
    imprimirComprovante(
      "ABERTURA DE CAIXA",
      `<p>Operador: ${auth.currentUser.email}</p><p>Troco: R$ ${troco.toFixed(2)}</p>`,
    );
    window.mostrarAlertaSistema(
      "Caixa iniciado com sucesso! Boas vendas.",
      "Frente de Caixa",
    );
    verificarFluxoCaixa();
  });

// Fechamento - cálculo do valor esperado
navBtnFechar.addEventListener("click", async () => {
  window.modalFechamento.show();
  let totalSuprimentos = 0,
    totalSangrias = 0,
    totalDinheiroVendas = 0;

  const sup = await get(ref(db, "suprimentos"));
  if (sup.exists())
    Object.values(sup.val()).forEach((s) => {
      if (s.caixaId === caixaAtivoId)
        totalSuprimentos += parseFloat(s.valor) || 0;
    });

  const san = await get(ref(db, "sangrias"));
  if (san.exists())
    Object.values(san.val()).forEach((s) => {
      if (s.caixaId === caixaAtivoId) totalSangrias += parseFloat(s.valor) || 0;
    });

  const ven = await get(ref(db, "vendas"));
  if (ven.exists())
    Object.values(ven.val()).forEach((v) => {
      if (v.caixaId === caixaAtivoId && v.formaPagamento === "DINHEIRO")
        totalDinheiroVendas += parseFloat(v.total) || 0;
    });

  const esperado =
    valorInicialTroco + totalDinheiroVendas + totalSuprimentos - totalSangrias;
  $("txt-valor-esperado").textContent = esperado.toFixed(2);
});

// Registrar Sangria / Suprimento
document
  .getElementById("btn-salvar-mov-caixa")
  .addEventListener("click", async () => {
    const tipo = $("modal-mov-tipo").value;
    const valor = parseFloatSafe($("modal-mov-valor").value);
    const justificativa = $("modal-mov-justificativa").value;

    if (isNaN(valor) || valor <= 0 || !justificativa.trim()) {
      return window.mostrarAlertaSistema(
        "Preencha valor e justificativa!",
        "Validação",
      );
    }

    const destino = tipo === "Suprimento" ? "suprimentos" : "sangrias";
    await set(push(ref(db, destino)), {
      caixaId: caixaAtivoId,
      valor: parseFloat(valor.toFixed(2)),
      justificativa: justificativa.trim(),
      usuario: auth.currentUser.email,
      dataHora: new Date().toISOString(),
    });

    imprimirComprovante(
      `COMPROVANTE DE ${tipo.toUpperCase()}`,
      `
        <p><strong>Tipo:</strong> ${tipo}</p>
        <p><strong>Valor:</strong> R$ ${valor.toFixed(2)}</p>
        <p><strong>Justificativa:</strong> ${justificativa}</p>
        <p><strong>Operador:</strong> ${auth.currentUser.email}</p>
    `,
    );
    window.mostrarAlertaSistema(`${tipo} lançado com sucesso!`, "Movimentação");
    window.modalSangria.hide();
    $("modal-mov-valor").value = "";
    $("modal-mov-justificativa").value = "";
  });

// Confirmar Encerramento de Caixa
document
  .getElementById("btn-confirmar-fechamento")
  .addEventListener("click", async () => {
    const valorContado = parseFloat(
      document.getElementById("caixa-valor-contado").value,
    );
    if (isNaN(valorContado))
      return window.mostrarAlertaSistema(
        "Digite o valor apurado fisicamente!",
        "Validação",
      );

    const valorEsperado = parseFloat(
      document.getElementById("txt-valor-esperado").textContent,
    );
    const diferenca = parseFloat((valorContado - valorEsperado).toFixed(2));
    const dataFechamento = new Date().toISOString();

    await update(ref(db, `caixas/${caixaAtivoId}`), {
      status: "Fechado",
      dataHoraFechamento: dataFechamento,
      valorEsperado,
      valorContado,
      diferenca,
      justificativaDiferenca:
        document.getElementById("caixa-justificativa-dif").value || "",
    });

    imprimirComprovante(
      "FECHAMENTO DE CAIXA",
      `
        <p><strong>Relatório de Fechamento</strong></p>
        <p>Operador: ${auth.currentUser.email}</p>
        <hr>
        <p><strong>Valor Esperado:</strong> R$ ${valorEsperado.toFixed(2)}</p>
        <p><strong>Valor Contado:</strong> R$ ${valorContado.toFixed(2)}</p>
        <p><strong>Diferença:</strong> R$ ${diferenca.toFixed(2)}</p>
        <p><strong>Obs:</strong> ${document.getElementById("caixa-justificativa-dif").value || "Nenhuma"}</p>
    `,
    );
    window.mostrarAlertaSistema(
      "Turno encerrado e relatório impresso!",
      "Caixa Fechado",
    );
    const modalFechamentoEl = document.getElementById("modal-fechamento");
    const bsModalFechamento = bootstrap.Modal.getInstance(modalFechamentoEl);
    if (bsModalFechamento) bsModalFechamento.hide();
    setTimeout(() => window.location.reload(), 1000);
  });

// ==========================================
// 2. SISTEMA DE BUSCA AVANÇADA
// ==========================================
async function carregarDadosParaBusca() {
  const prodSnap = await get(ref(db, "produtos"));
  if (prodSnap.exists()) listaProdutosMemoria = prodSnap.val();

  const cliSnap = await get(ref(db, "clientes"));
  if (cliSnap.exists()) listaClientesMemoria = cliSnap.val();
}

// Busca de produtos
document.getElementById("pdv-busca-produto").addEventListener("input", (e) => {
  const termo = e.target.value.toLowerCase().trim();
  const divResultados = document.getElementById("lista-busca-produto");
  divResultados.innerHTML = "";

  if (!termo) {
    divResultados.style.display = "none";
    return;
  }

  let filtrados = 0;
  Object.entries(listaProdutosMemoria).forEach(([id, p]) => {
    if (
      p.descricao.toLowerCase().includes(termo) ||
      String(p.codigoBarras).includes(termo)
    ) {
      if (filtrados++ >= 5) return;
      const item = document.createElement("div");
      item.className = "busca-item";
      item.textContent = `${p.codigoBarras} - ${p.descricao} (R$: ${p.valorVenda})`;
      item.addEventListener("click", () => {
        document.getElementById("pdv-busca-produto").value = p.descricao;
        produtoSelecionadoId = id;
        divResultados.style.display = "none";
      });
      divResultados.appendChild(item);
    }
  });
  divResultados.style.display = filtrados > 0 ? "block" : "none";
});

// Busca de clientes
document.getElementById("pdv-busca-cliente").addEventListener("input", (e) => {
  const termo = e.target.value.toLowerCase().trim();
  const divResultados = document.getElementById("lista-busca-cliente");
  divResultados.innerHTML = "";

  if (!termo) {
    divResultados.style.display = "none";
    return;
  }

  let filtrados = 0;
  Object.entries(listaClientesMemoria).forEach(([id, c]) => {
    const doc = String(c.cpf || "");
    if (c.nome.toLowerCase().includes(termo) || doc.includes(termo)) {
      if (filtrados++ >= 5) return;
      const item = document.createElement("div");
      item.className = "busca-item";
      item.textContent = `${c.nome} - Dívida: R$ ${(c.saldoDevedor || 0).toFixed(2)}`;
      item.addEventListener("click", () => {
        document.getElementById("pdv-busca-cliente").value = c.nome;
        document.getElementById("pdv-cliente-id-selecionado").value = id;
        divResultados.style.display = "none";
      });
      divResultados.appendChild(item);
    }
  });
  divResultados.style.display = filtrados > 0 ? "block" : "none";
});

// Esconde busca ao clicar fora
document.addEventListener("click", (e) => {
  if (!e.target.closest(".position-relative")) {
    document.getElementById("lista-busca-produto").style.display = "none";
    document.getElementById("lista-busca-cliente").style.display = "none";
  }
});

// ==========================================
// 3. MOTOR DO CARRINHO E VENDA
// ==========================================
document.getElementById("btn-adicionar-item").addEventListener("click", () => {
  const qtd = parseFloat(document.getElementById("pdv-qtd").value) || 1;
  if (produtoSelecionadoId && listaProdutosMemoria[produtoSelecionadoId]) {
    inserirNoCarrinho(
      produtoSelecionadoId,
      listaProdutosMemoria[produtoSelecionadoId],
      qtd,
    );
  } else {
    const textoInput = document
      .getElementById("pdv-busca-produto")
      .value.trim();
    let achadoId = null;
    Object.entries(listaProdutosMemoria).forEach(([id, p]) => {
      if (String(p.codigoBarras) === textoInput) achadoId = id;
    });
    if (achadoId) {
      inserirNoCarrinho(achadoId, listaProdutosMemoria[achadoId], qtd);
    } else {
      window.mostrarAlertaSistema("Produto não encontrado!", "Atenção");
    }
  }
});

function inserirNoCarrinho(id, itemDados, qtd) {
  let precoAplicado = parseFloat(itemDados.valorVenda);
  if (
    itemDados.qtdAtacado &&
    qtd >= itemDados.qtdAtacado &&
    itemDados.valorAtacado > 0
  ) {
    precoAplicado = parseFloat(itemDados.valorAtacado);
  }

  carrinho.push({
    id: id,
    descricao: itemDados.descricao,
    quantidade: qtd,
    precoUnitario: precoAplicado,
    subtotal: parseFloat((precoAplicado * qtd).toFixed(2)),
  });

  document.getElementById("pdv-busca-produto").value = "";
  document.getElementById("pdv-qtd").value = 1;
  produtoSelecionadoId = null;
  renderizarCarrinhoHTML();
}

function renderizarCarrinhoHTML() {
  const tbody = document
    .getElementById("tabela-carrinho")
    .querySelector("tbody");
  tbody.innerHTML = "";
  totalVendaGlobal = 0;

  carrinho.forEach((item, index) => {
    totalVendaGlobal += item.subtotal;
    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td>${index + 1}</td>
            <td>${item.descricao}</td>
            <td>${item.quantidade}</td>
            <td>R$ ${item.precoUnitario.toFixed(2)}</td>
            <td>R$ ${item.subtotal.toFixed(2)}</td>
            <td><button class="btn btn-sm btn-danger" onclick="window.removerItemCarrinho(${index})">X</button></td>
        `;
    tbody.appendChild(tr);
  });
  document.getElementById("pdv-total-venda").textContent =
    totalVendaGlobal.toFixed(2);
}

window.removerItemCarrinho = (index) => {
  carrinho.splice(index, 1);
  renderizarCarrinhoHTML();
};


// Fechamento de Cupom
document
  .getElementById("btn-finalizar-venda")
  .addEventListener("click", async () => {
    pagamentosAdicionados = [];

    atualizarTelaRecebimento();

    const recebimentoEl = document.getElementById("modal-recebimento");
    const modalReceb =
      window.bootstrap.Modal.getOrCreateInstance(recebimentoEl);

    modalReceb.show();

    setTimeout(() => {
      document.getElementById("recebimento-valor").focus();
    }, 300);
  });
// ==========================================
// CONTROLADOR DE VENDAS PENDENTES CORRIGIDO
// ==========================================

// 1. SALVAR OU ATUALIZAR A VENDA COMO PENDENTE E GERAR COMANDA
document
  .getElementById("btn-pendente-venda")
  .addEventListener("click", async () => {
    if (carrinho.length === 0)
      return window.mostrarAlertaSistema("Carrinho vazio!", "Aviso");

    const clienteId = document.getElementById(
      "pdv-cliente-id-selecionado",
    ).value;
    if (!clienteId) {
      return window.mostrarAlertaSistema(
        "Selecione um cliente para registrar a entrega pendente!",
        "Atenção",
      );
    }

    const dadosCliente = listaClientesMemoria[clienteId];
    const enderecoCompleto = `${dadosCliente.rua || "Não informado"}, ${dadosCliente.bairro || ""}`;

    // Agora salvamos a estrutura completa para o Dashboard e para o Motoboy
    const vendaPendente = {
      caixaId: caixaAtivoId,
      operador: auth.currentUser.email,
      clienteId: clienteId,
      clienteNome: dadosCliente.nome,
      clienteTelefone: dadosCliente.telefone || "Não informado",
      enderecoEntrega: enderecoCompleto,
      itens: carrinho,
      total: parseFloat(totalVendaGlobal.toFixed(2)),
      status: "Pendente", // Dashboard filtra por aqui
      dataHora: new Date().toISOString(),
    };

    // CORREÇÃO DA DUPLICAÇÃO: Verifica se já era uma pendência sendo reconfigurada/editada
    if (vendaPendenteEmEdicaoId) {
      await set(
        ref(db, `vendas_pendentes/${vendaPendenteEmEdicaoId}`),
        vendaPendente,
      );
    } else {
      const novaPendenciaRef = push(ref(db, "vendas_pendentes"));
      await set(novaPendenciaRef, vendaPendente);
    }

    // Impressão da Comanda de Entrega para o Motoboy com dados destacados
    let itensHtml = carrinho
      .map(
        (item) => `
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span>${item.quantidade}x ${item.descricao}</span>
            <span>R$ ${item.subtotal.toFixed(2)}</span>
        </div>
    `,
      )
      .join("");

    imprimirComprovante(
      "COMANDA DE ENTREGA (PENDENTE)",
      `
        <div style="font-size: 14px; font-family: monospace;">
            <p><strong>👤 Cliente:</strong> ${dadosCliente.nome}</p>
            <p><strong>📞 Telefone:</strong> ${dadosCliente.telefone || "N/I"}</p>
            <p><strong>📍 Endereço:</strong> ${enderecoCompleto}</p>
            <hr style="border-style: dashed;">
            <strong>ITENS DO PEDIDO:</strong><br>
            ${itensHtml}
            <hr style="border-style: dashed;">
            <p style="font-size: 16px; text-align: right;"><strong>TOTAL A RECEBER: R$ ${totalVendaGlobal.toFixed(2)}</strong></p>
            <p style="text-align: center; margin-top: 10px; border: 1px solid #000; padding: 5px; font-weight: bold;">📦 LEVAR MAQUINETA / COBRAR NA ENTREGA</p>
        </div>
    `,
    );

    // Reseta o estado do PDV e a variável de controle
    carrinho = [];
    vendaPendenteEmEdicaoId = null;
    document.getElementById("pdv-cliente-id-selecionado").value = "";
    document.getElementById("pdv-busca-cliente").value = "";
    renderizarCarrinhoHTML();
    window.mostrarAlertaSistema(
      "Pedido pendente salvo com sucesso! Comanda impressa.",
      "Sucesso",
    );
  });

// 2. BUSCAR COMPRA PENDENTE E EXIBIR MODAL
document
  .getElementById("btn-consultar-pendentes")
  .addEventListener("click", async () => {
    let modal = document.getElementById("modal-lista-pendentes");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "modal-lista-pendentes";
      modal.className = "modal fade";
      modal.tabIndex = -1;
      modal.innerHTML = `
            <div class="modal-dialog modal-lg modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header bg-warning text-dark">
                        <h5 class="modal-title fw-bold">⏳ Entregas / Vendas Pendentes</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body" style="max-height: 400px; overflow-y: auto;">
                        <table class="table table-hover align-middle">
                            <thead>
                                <tr>
                                    <th>Cliente</th>
                                    <th>Data/Hora</th>
                                    <th>Itens</th>
                                    <th>Total</th>
                                    <th>Ação</th>
                                </tr>
                            </thead>
                            <tbody id="corpo-tabela-pendentes"></tbody>
                        </table>
                    </div>
                </div>
            </div>`;
      document.body.appendChild(modal);
    }

    const tbody = document.getElementById("corpo-tabela-pendentes");
    tbody.innerHTML =
      '<tr><td colspan="5" class="text-center">Carregando pendências...</td></tr>';

    const bsModal = bootstrap.Modal.getOrCreateInstance(modal);
    bsModal.show();

    const snapshot = await get(ref(db, "vendas_pendentes"));
    tbody.innerHTML = "";

    if (!snapshot.exists()) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="text-center text-muted">Nenhuma venda pendente na rua.</td></tr>';
      return;
    }

    snapshot.forEach((childSnapshot) => {
      const idKey = childSnapshot.key;
      const v = childSnapshot.val();
      const dataFmt = new Date(v.dataHora).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });

      const tr = document.createElement("tr");
      tr.innerHTML = `
            <td><strong>${v.clienteNome}</strong></td>
            <td>${dataFmt}</td>
            <td>${(v.itens || v.items || []).length} item(ns)</td>
            <td class="fw-bold text-danger">R$ ${v.total.toFixed(2)}</td>
            <td>
                <button class="btn btn-sm btn-success fw-bold" onclick="recuperarPendenciaParaOFluxo('${idKey}')">
                    ⚡ Trazer p/ Caixa
                </button>
            </td>
        `;
      tbody.appendChild(tr);
    });
  });

// ==========================================
// ABRIR MODAL DE RECEBIMENTO
// ==========================================
document.getElementById("btn-finalizar-venda").addEventListener("click", () => {
  if (carrinho.length === 0) {
    return window.mostrarAlertaSistema("Carrinho vazio!", "Aviso");
  }

  // Limpa os pagamentos da venda anterior
  pagamentosAdicionados = [];

  // Atualiza a tela do modal
  atualizarTelaRecebimento();

  // Obtém ou cria a instância do modal
  const recebimentoEl = document.getElementById("modal-recebimento");
  const modalRecebimento = bootstrap.Modal.getOrCreateInstance(recebimentoEl);

  // Exibe o modal
  modalRecebimento.show();

  // Foca no campo de valor
  setTimeout(() => {
    document.getElementById("recebimento-valor").focus();
    document.getElementById("recebimento-valor").select();
  }, 300);
});

// 3. RECUPERAR A PENDÊNCIA E FECHAR O MODAL CORRETAMENTE
window.recuperarPendenciaParaOFluxo = async (pendenciaId) => {
  const snap = await get(ref(db, `vendas_pendentes/${pendenciaId}`));
  if (snap.exists()) {
    const dados = snap.val();

    // Carrega os dados no carrinho e identifica o cliente
    carrinho = dados.itens || dados.items || [];
    document.getElementById("pdv-cliente-id-selecionado").value =
      dados.clienteId;
    document.getElementById("pdv-busca-cliente").value = dados.clienteNome;

    // Define o ID em edição para impedir duplicação ao clicar em "Pendente" novamente
    vendaPendenteEmEdicaoId = pendenciaId;

    renderizarCarrinhoHTML();

    // CORREÇÃO DO MODAL: Fecha o modal limpando as instâncias corretamente
    const modalEl = document.getElementById("modal-lista-pendentes");
    const modalInstance = window.bootstrap.Modal.getInstance(modalEl);
    if (modalInstance) {
      modalInstance.hide();
    }

    window.mostrarAlertaSistema(
      "Pedido carregado! Para finalizar, adicione o pagamento e pressione F10.",
      "Sucesso",
    );
  }
};

function atualizarTelaRecebimento() {
  const total = totalVendaGlobal;

  const recebido = pagamentosAdicionados.reduce((soma, pagamento) => {
    return soma + pagamento.valor;
  }, 0);

  let restante = total - recebido;
  let troco = 0;

  if (restante < 0) {
    troco = Math.abs(restante);
    restante = 0;
  }

  document.getElementById("modal-total-venda").textContent = total.toFixed(2);
  document.getElementById("modal-total-recebido").textContent =
    recebido.toFixed(2);
  document.getElementById("modal-total-restante").textContent =
    restante.toFixed(2);
  document.getElementById("recebimento-troco").textContent = troco.toFixed(2);

  const areaTroco = document.getElementById("area-troco");

  if (troco > 0) {
    areaTroco.classList.remove("d-none");
  } else {
    areaTroco.classList.add("d-none");
  }

  const tbody = document.getElementById("lista-pagamentos");
  tbody.innerHTML = "";

  pagamentosAdicionados.forEach((pagamento, index) => {
    tbody.innerHTML += `
            <tr>
                <td>${pagamento.forma}</td>
                <td class="text-end">
                    R$ ${pagamento.valor.toFixed(2)}
                    <button
                        class="btn btn-link btn-sm text-danger"
                        onclick="removerPagamento(${index})">
                        ❌
                    </button>
                </td>
            </tr>
        `;
  });

  const btnAdicionar = document.getElementById("btn-adicionar-pagamento");
  const btnConfirmar = document.getElementById("btn-confirmar-venda");

  if (recebido >= total) {
    btnAdicionar.classList.add("d-none");
    btnConfirmar.classList.remove("d-none");

    document.getElementById("recebimento-valor").value = "";
  } else {
    btnAdicionar.classList.remove("d-none");
    btnConfirmar.classList.add("d-none");

    document.getElementById("recebimento-valor").value = restante.toFixed(2);
  }
}

document.getElementById('btn-adicionar-pagamento').addEventListener('click', () => {

    const forma = document.getElementById('recebimento-forma').value;
    const valor = parseFloatSafe(document.getElementById('recebimento-valor').value);

    if (isNaN(valor) || valor <= 0) {
        return window.mostrarAlertaSistema("Informe um valor válido maior que zero.", "Atenção");
    }

    const nomesFormas = {
        'DINHEIRO': 'Dinheiro',
        'PIX': 'PIX',
        'DEBITO': 'Cartão Débito',
        'CREDITO': 'Cartão Crédito',
        'CREDITO_LOJA': 'Fiado (Crédito Loja)'
    };

    pagamentosAdicionados.push({
        formaTag: forma,
        forma: nomesFormas[forma] || forma,
        valor: valor
    });

    document.getElementById('recebimento-valor').value = '';
    if (clienteId && listaClientesMemoria[clienteId]) {
        const cliente = listaClientesMemoria[clienteId];
        window.mostrarConfirmacaoSistema?.( `Deseja enviar o cupom para ${cliente.nome} no WhatsApp?`, () => {
                abrirModalWhatsAppCupom(cliente, carrinho,totalVendaGlobal);
            }
        ) || abrirModalWhatsAppCupom(cliente, carrinho, totalVendaGlobal);
    }
    atualizarTelaRecebimento();

});

document.getElementById('btn-confirmar-venda').addEventListener('click', async () => {

    const clienteId = document.getElementById('pdv-cliente-id-selecionado').value;

    if (pagamentosAdicionados.length === 0) {
        return window.mostrarAlertaSistema("Adicione pelo menos um pagamento!", "Aviso");
    }

    // Converte pagamentos do modal para estrutura do banco
    let pagamentoBD = {
        dinheiro: 0,
        pix: 0,
        debito: 0,
        credito: 0,
        creditoLoja: 0
    };

    pagamentosAdicionados.forEach(p => {
        if (p.formaTag === 'DINHEIRO') pagamentoBD.dinheiro += p.valor;
        if (p.formaTag === 'PIX') pagamentoBD.pix += p.valor;
        if (p.formaTag === 'DEBITO') pagamentoBD.debito += p.valor;
        if (p.formaTag === 'CREDITO') pagamentoBD.credito += p.valor;
        if (p.formaTag === 'CREDITO_LOJA') pagamentoBD.creditoLoja += p.valor;
    });

    const totalPago = pagamentosAdicionados.reduce((acc, p) => acc + p.valor, 0);
    const troco = parseFloat((totalPago - totalVendaGlobal).toFixed(2));

    // =========================
    // VALIDAÇÃO FIADO
    // =========================
    if (pagamentoBD.creditoLoja > 0) {

        if (!clienteId) {
            return window.mostrarAlertaSistema("Selecione um cliente para venda fiada!", "Bloqueio");
        }

        const cliSnap = await get(ref(db, `clientes/${clienteId}`));

        if (!cliSnap.exists()) {
            return window.mostrarAlertaSistema("Cliente não encontrado!", "Erro");
        }

        const cli = cliSnap.val();

        const novaDivida = parseFloat(((cli.saldoDevedor || 0) + pagamentoBD.creditoLoja).toFixed(2));

        if (novaDivida > (cli.limiteCredito || 0)) {
            return window.mostrarAlertaSistema(
                `BLOQUEADO: Limite R$ ${(cli.limiteCredito || 0).toFixed(2)} excedido`,
                "Limite"
            );
        }

        await update(ref(db, `clientes/${clienteId}`), {
            saldoDevedor: novaDivida
        });

        await set(push(ref(db, 'contasReceber')), {
            clienteId,
            clienteNome: cli.nome,
            valor: pagamentoBD.creditoLoja,
            status: 'Aberto',
            dataLancamento: new Date().toISOString()
        });
    }

    // =========================
    // BAIXA ESTOQUE
    // =========================
    for (let item of carrinho) {

        const pSnap = await get(ref(db, `produtos/${item.id}`));

        if (pSnap.exists()) {
            const estoqueAtual = parseFloat(pSnap.val().estoque || 0);

            await update(ref(db, `produtos/${item.id}`), {
                estoque: estoqueAtual - item.quantidade
            });
        }
    }

    // =========================
    // GRAVA VENDA
    // =========================
    await set(push(ref(db, 'vendas')), {
        caixaId: caixaAtivoId,
        operador: auth.currentUser.email,
        clienteId: clienteId || null,
        clienteNome: clienteId ? listaClientesMemoria[clienteId].nome : null,
        itens: carrinho,
        total: parseFloat(totalVendaGlobal.toFixed(2)),
        pagamento: pagamentoBD,
        totalPago: totalPago,
        troco: troco,
        status: 'Finalizada',
        dataHora: new Date().toISOString()
    });

    // =========================
    // LIMPA CARRINHO
    // =========================
    carrinho = [];
    pagamentosAdicionados = [];

    document.getElementById('pdv-cliente-id-selecionado').value = '';
    document.getElementById('pdv-busca-cliente').value = '';

    renderizarCarrinhoHTML();

    // Fecha modal
    const recebimentoEl = document.getElementById('modal-recebimento');
    const modalReceb = bootstrap.Modal.getInstance(recebimentoEl);
    if (modalReceb) modalReceb.hide();

    window.mostrarAlertaSistema("Venda finalizada com sucesso!", "Sucesso");

});
window.removerPagamento = function (index) {
  pagamentosAdicionados.splice(index, 1);
  atualizarTelaRecebimento();
};
