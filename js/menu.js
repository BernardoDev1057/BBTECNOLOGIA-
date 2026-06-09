import { auth } from './firebase-config.js';
import { signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

// Função que renderiza o menu dentro de qualquer página
export function renderizarMenuGlobal(paginaAtiva) {
    const localMenu = document.getElementById('menu-global-container');
    if (!localMenu) return;

    // Estrutura HTML do menu único
    localMenu.innerHTML = `
        <nav style="background: #333; padding: 15px; border-radius: 5px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
            <div>
                <a href="dashboard.html" class="${paginaAtiva === 'dashboard' ? 'menu-ativo' : ''}">Dashboard</a>
                <a href="clientes.html" class="${paginaAtiva === 'clientes' ? 'menu-ativo' : ''}">Clientes</a>
                <a href="produtos.html" class="${paginaAtiva === 'produtos' ? 'menu-ativo' : ''}">Produtos</a>
                <a href="caixa.html" class="${paginaAtiva === 'caixa' ? 'menu-ativo' : ''}">Operação de Caixa/PDV</a>
                <a href="contas.html" class="${paginaAtiva === 'contas' ? 'menu-ativo' : ''}">Contas a Receber</a>
                <a href="relatorios.html" class="${paginaAtiva === 'relatorios' ? 'menu-ativo' : ''}">Relatórios</a>
            </div>
            <button id="btn-logout-global" style="background: #dc3545; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; font-weight: bold;">Sair (Logout)</button>
        </nav>
    `;

    // Atribui o evento de logout automaticamente em todas as páginas
    document.getElementById('btn-logout-global').addEventListener('click', () => {
        const conf = confirm("Deseja realmente sair do sistema?");
        if (conf) {
            signOut(auth).then(() => {
                window.location.href = 'index.html';
            });
        }
    });
}

