import { auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

// Monitor de Sessão Ativa
onAuthStateChanged(auth, (user) => {
    const paginaAtual = window.location.pathname.split("/").pop();

    if (!user) {
        // Se deslogado e não estiver no login, chuta para a tela inicial
        if (paginaAtual !== "index.html" && paginaAtual !== "") {
            window.location.href = "index.html";
        }
    } else {
        // Se logado e tentar voltar para a tela de login, redireciona ao painel
        if (paginaAtual === "index.html" || paginaAtual === "") {
            window.location.href = "dashboard.html";
        }
    }
});

