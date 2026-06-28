/**
 * =========================================
 * WHATSAPP UTILITÁRIO COMPLETO (PDV)
 * =========================================
 */

/**
 * Envia mensagem via WhatsApp Web/Desktop
 */
export function dispararMensagemWhatsApp(telefone, mensagem) {
  if (!telefone) {
    if (window.mostrarAlertaSistema) {
      window.mostrarAlertaSistema(
        "Este cliente não possui telefone cadastrado!",
        "WhatsApp",
      );
    } else {
      alert("Este cliente não possui telefone cadastrado!");
    }
    return;
  }

  let numeroLimpo = telefone.replace(/\D/g, "");

  if (numeroLimpo.length === 11 || numeroLimpo.length === 10) {
    numeroLimpo = "55" + numeroLimpo;
  }

  const textoCodificado = encodeURIComponent(mensagem);

  const urlFinal = `https://api.whatsapp.com/send?phone=${numeroLimpo}&text=${textoCodificado}`;

  window.open(urlFinal, "_blank");
}

/**
 * Modal de envio de cupom WhatsApp
 */
export function abrirModalWhatsAppCupom(cliente, carrinho, totalVenda) {
  let modal = document.getElementById("modal-whatsapp-cupom");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "modal-whatsapp-cupom";
    modal.className = "modal fade";

    modal.innerHTML = `
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">

                <div class="modal-header bg-success text-white">
                    <h5 class="modal-title">📲 Enviar cupom WhatsApp</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>

                <div class="modal-body">

                    <p id="whats-info"></p>

                    <label class="form-label">Telefone do cliente</label>
                    <input type="text" id="whats-numero" class="form-control" placeholder="Ex: 84999999999">

                    <button class="btn btn-success w-100 mt-3" id="btn-enviar-whats">
                        Enviar Cupom
                    </button>

                </div>

            </div>
        </div>`;

    document.body.appendChild(modal);
  }

  const input = modal.querySelector("#whats-numero");
  const info = modal.querySelector("#whats-info");
  const btn = modal.querySelector("#btn-enviar-whats");

  input.value = cliente?.telefone || "";

  info.innerHTML = cliente?.telefone
    ? `Cliente: <b>${cliente.nome}</b><br>Telefone encontrado no cadastro.`
    : `Cliente <b>${cliente.nome}</b> não possui telefone cadastrado.`;

  // evita múltiplos eventos duplicados
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);

  const bsModal = window.bootstrap?.Modal?.getOrCreateInstance(modal);
  bsModal.show();

  newBtn.addEventListener("click", () => {
    let numero = input.value.trim().replace(/\D/g, "");

    if (!numero) {
      window.mostrarAlertaSistema?.("Digite um número válido!", "WhatsApp") ||
        alert("Digite um número válido!");
      return;
    }

    if (numero.length < 10) {
      window.mostrarAlertaSistema?.("Número inválido!", "WhatsApp") ||
        alert("Número inválido!");
      return;
    }

    let msg = `🧾 *CUPOM FISCAL*\n`;
    msg += `--------------------------------\n`;
    msg += `Cliente: ${cliente.nome}\n\n`;

    carrinho.forEach((item) => {
      msg += `${item.quantidade}x ${item.descricao} - R$ ${item.subtotal.toFixed(2)}\n`;
    });

    msg += `\n--------------------------------\n`;
    msg += `TOTAL: R$ ${totalVenda.toFixed(2)}\n`;
    msg += `--------------------------------\n`;
    msg += `Obrigado pela preferência! 🙌`;

    dispararMensagemWhatsApp(numero, msg);

    bsModal.hide();
  });
}

export function enviarMensagemCobranca(cliente, mensagemExtra = "") {
  if (!cliente || !cliente.telefone) {
    if (window.mostrarAlertaSistema) {
      window.mostrarAlertaSistema(
        "Cliente não possui telefone cadastrado!",
        "Cobrança",
      );
    } else {
      alert("Cliente não possui telefone cadastrado!");
    }
    return;
  }

  let numeroLimpo = cliente.telefone.replace(/\D/g, "");

  if (numeroLimpo.length === 11 || numeroLimpo.length === 10) {
    numeroLimpo = "55" + numeroLimpo;
  }

  let msg = `Olá ${cliente.nome}, tudo bem?\n\n`;
  msg += `Identificamos um saldo em aberto em seu cadastro.\n\n`;

  if (cliente.saldoDevedor) {
    msg += `Valor em aberto: R$ ${cliente.saldoDevedor.toFixed(2)}\n\n`;
  }

  if (mensagemExtra) {
    msg += `${mensagemExtra}\n\n`;
  }

  msg += `Por favor, entre em contato para regularização.\n`;
  msg += `Obrigado! 🙌`;

  const textoCodificado = encodeURIComponent(msg);

  const urlFinal = `https://api.whatsapp.com/send?phone=${numeroLimpo}&text=${textoCodificado}`;

  window.open(urlFinal, "_blank");
}