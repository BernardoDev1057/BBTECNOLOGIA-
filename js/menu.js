import { auth } from './firebase-config.js';
import { signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

export function renderizarMenuGlobal(paginaAtiva) {
    const localMenu = document.getElementById('menu-global-container');
    if (!localMenu) return;

    localMenu.innerHTML = `
        <nav class="navbar navbar-expand-lg navbar-dark bg-dark mb-4 rounded shadow-sm">
            <div class="container-fluid">
                <a class="navbar-brand fw-bold" href="dashboard.html">🚀 PAINEL DE CONTROLE</a>
                <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
                    <span class="navbar-toggler-icon"></span>
                </button>
                <div class="collapse navbar-collapse" id="navbarNav">
                    <ul class="navbar-nav me-auto mb-2 mb-lg-0">
                        <li class="nav-item">
                            <a class="nav-link ${paginaAtiva === 'dashboard' ? 'active fw-bold text-primary' : ''}" href="dashboard.html">Dashboard</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link ${paginaAtiva === 'clientes' ? 'active fw-bold text-primary' : ''}" href="clientes.html">Clientes</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link ${paginaAtiva === 'produtos' ? 'active fw-bold text-primary' : ''}" href="produtos.html">Produtos</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link ${paginaAtiva === 'caixa' ? 'active fw-bold text-primary' : ''}" href="caixa.html">Frente de Caixa (PDV)</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link ${paginaAtiva === 'contas' ? 'active fw-bold text-primary' : ''}" href="contas.html">Contas a Receber</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link ${paginaAtiva === 'relatorios' ? 'active fw-bold text-primary' : ''}" href="relatorios.html">Relatórios</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link ${paginaAtiva === 'ajustes' ? 'active fw-bold text-primary' : ''}" href="ajustes.html">Ajustes Preços</a>
                        </li>
                    </ul>
                    <button id="btn-logout-global" class="btn btn-danger btn-sm fw-bold w-sm-100 mt-2 mt-lg-0">Sair (Logout)</button>
                </div>
            </div>
        </nav>
    `;

    document.getElementById('btn-logout-global').addEventListener('click', () => {
        if (confirm("Deseja realmente sair do sistema?")) {
            signOut(auth).then(() => {
                window.location.href = 'index.html';
            });
        }
    });
}

