import { auth } from './firebase-config.js';
import { signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { $, setText, setHTML } from './utils.js';

export function renderizarMenuGlobal(paginaAtiva) {
    const localMenu = $('menu-global-container');
    if (!localMenu) return;

    localMenu.innerHTML = `
    <nav class="navbar navbar-expand-lg navbar-dark bg-dark mb-4 rounded shadow-sm">
        <div class="container-fluid">
            <a class="navbar-brand fw-bold" href="dashboard.html">🚀 PAINEL DE CONTROLE</a>
            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav"><span class="navbar-toggler-icon"></span></button>
            <div class="collapse navbar-collapse" id="navbarNav">
                <ul class="navbar-nav me-auto mb-2 mb-lg-0">
                    <li class="nav-item"><a class="nav-link ${paginaAtiva === 'dashboard' ? 'active fw-bold text-primary' : ''}" href="dashboard.html">Dashboard</a></li>
                    <li class="nav-item"><a class="nav-link ${paginaAtiva === 'clientes' ? 'active fw-bold text-primary' : ''}" href="clientes.html">Clientes</a></li>
                    <li class="nav-item"><a class="nav-link ${paginaAtiva === 'vendas' ? 'active fw-bold text-primary' : ''}" href="vendas.html">Vendas</a></li>
                    <li class="nav-item"><a class="nav-link ${paginaAtiva === 'produtos' ? 'active fw-bold text-primary' : ''}" href="produtos.html">Produtos</a></li>
                    <li class="nav-item"><a class="nav-link ${paginaAtiva === 'caixa' ? 'active fw-bold text-primary' : ''}" href="caixa.html">Frente de Caixa (PDV)</a></li>
                    <li class="nav-item"><a class="nav-link ${paginaAtiva === 'contas' ? 'active fw-bold text-primary' : ''}" href="contas.html">Contas a Receber</a></li>
                    <li class="nav-item"><a class="nav-link ${paginaAtiva === 'relatorios' ? 'active fw-bold text-primary' : ''}" href="relatorios.html">Relatórios</a></li>
                    <li class="nav-item"><a class="nav-link ${paginaAtiva === 'ajustes' ? 'active fw-bold text-primary' : ''}" href="ajustes.html">Ajustes Preços</a></li>
                    <li class="nav-item"><a class="nav-link ${paginaAtiva === 'sobre' ? 'active fw-bold text-primary' : ''}" href="sobre.html">Sobre</a></li>
                </ul>
                <button id="btn-logout-global" class="btn btn-danger btn-sm fw-bold w-sm-100 mt-2 mt-lg-0">Sair (Logout)</button>
            </div>
        </div>
    </nav>

    <div class="modal fade" id="modal-alerta-sistema" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
                <div class="modal-header bg-dark text-white py-2">
                    <h6 class="modal-title fw-bold" id="modal-alerta-titulo">Aviso do Sistema</h6>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body text-center py-3" id="modal-alerta-corpo"></div>
                <div class="modal-footer py-1"><button type="button" class="btn btn-secondary btn-sm fw-bold" data-bs-with-dismiss="modal" data-bs-dismiss="modal">OK</button></div>
            </div>
        </div>
    </div>

    <div class="modal fade" id="modal-confirm-sistema" data-bs-backdrop="static" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
                <div class="modal-header bg-primary text-white py-2">
                    <h6 class="modal-title fw-bold">Confirmação Requerida</h6>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body py-3" id="modal-confirm-corpo"></div>
                <div class="modal-footer py-1">
                    <button type="button" class="btn btn-secondary btn-sm fw-bold" data-bs-dismiss="modal" id="modal-confirm-btn-nao">Não / Cancelar</button>
                    <button type="button" class="btn btn-success btn-sm fw-bold" id="modal-confirm-btn-sim">Sim / Confirmar</button>
                </div>
            </div>
        </div>
    </div>
    `;

    // Instâncias Globais dos Modais Utilitários
    const bModalAlerta = new bootstrap.Modal(document.getElementById('modal-alerta-sistema'));
    const bModalConfirm = new bootstrap.Modal(document.getElementById('modal-confirm-sistema'));

    window.mostrarAlertaSistema = (mensagem, titulo = "Aviso do Sistema") => {
        setText('modal-alerta-titulo', titulo);
        setHTML('modal-alerta-corpo', mensagem);
        bModalAlerta.show();
    };

    window.mostrarConfirmacaoSistema = (mensagem, callbackSim) => {
        setText('modal-confirm-corpo', mensagem);
        
        const btnSim = $('modal-confirm-btn-sim');
        // Remove listeners antigos clonando o botão
        const novoBtnSim = btnSim.cloneNode(true);
        btnSim.parentNode.replaceChild(novoBtnSim, btnSim);

        novoBtnSim.addEventListener('click', () => {
            bModalConfirm.hide();
            callbackSim();
        });
        bModalConfirm.show();
    };

    document.getElementById('btn-logout-global').addEventListener('click', () => {
        window.mostrarConfirmacaoSistema("Deseja realmente sair do sistema?", () => {
            signOut(auth).then(() => { window.location.href = 'index.html'; });
        });
    });
}
