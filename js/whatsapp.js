/**
 * Utilitário global para disparo de mensagens via WhatsApp Web/Desktop
 * @param {string} telefone - Número do cliente (Ex: "84 99999-1111")
 * @param {string} mensagem - Texto puro contendo quebras de linha (\n)
 */
export function dispararMensagemWhatsApp(telefone, mensagem) {
    if (!telefone) {
        alert("Este cliente não possui telefone cadastrado!");
        return;
    }

    // Sanitização estrita: Mantém apenas os números
    let numeroLimpo = telefone.replace(/\D/g, '');

    // Se o operador não digitou o código do país (55), injeta automaticamente
    if (numeroLimpo.length === 11 || numeroLimpo.length === 10) {
        numeroLimpo = "55" + numeroLimpo;
    }

    // Codifica os caracteres especiais, espaços e quebras de linha para padrão de URL
    const textoCodificado = encodeURIComponent(mensagem);

    // Monta o link nativo que abre no navegador (WhatsApp Web ou redireciona pro App)
    const urlFinal = `https://api.whatsapp.com/send?phone=${numeroLimpo}&text=${textoCodificado}`;

    // Abre em uma nova aba em segundo plano
    window.open(urlFinal, '_blank');
}

