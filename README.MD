ERP Distribuidora

Sistema ERP/PDV Web desenvolvido em HTML, JavaScript (ES Modules) e Firebase, voltado para distribuidoras, mercadinhos, conveniências e pequenos comércios.

Funcionalidades

- 🔐 Autenticação de usuários via Firebase Authentication.
- 📊 Dashboard gerencial em tempo real.
- 📦 Cadastro e gerenciamento de produtos.
- 💰 Ajuste rápido de preços e margens.
- 🛒 PDV (Frente de Caixa).
- 💵 Abertura e fechamento de caixa.
- 💸 Sangrias e suprimentos.
- 👥 Cadastro de clientes.
- 💳 Controle de contas a receber (fiado).
- 📋 Controle de vendas.
- ⏳ Vendas pendentes para entrega.
- 📈 Relatórios gerenciais.
- 🖨️ Impressão de comprovantes.
- 📲 Envio de comprovantes via WhatsApp.
- 📉 Controle automático de estoque.

---

Tecnologias

- HTML5
- JavaScript (ES Modules)
- Bootstrap 5
- Firebase Authentication
- Firebase Realtime Database

---

Estrutura do Projeto

/
├── index.html
├── dashboard.html
├── produtos.html
├── clientes.html
├── caixa.html
├── vendas.html
├── contas.html
├── ajustes.html
├── relatorios.html
└── js/
    ├── firebase-config.js
    ├── auth-guard.js
    ├── dashboard.js
    ├── produtos.js
    ├── clientes.js
    ├── caixa.js
    ├── vendas.js
    ├── contas.js
    ├── ajustes.js
    ├── relatorios.js
    ├── impressora.js
    ├── whatsapp.js
    ├── menu.js
    └── utils.js

---

Recursos

Dashboard

- Vendas do dia
- Vendas do mês
- Ticket médio
- Lucro estimado
- Caixa atual
- Contas a receber
- Produtos com estoque baixo
- Ranking dos produtos mais vendidos

Produtos

- Cadastro
- Alteração
- Exclusão
- Controle de estoque
- Código de barras
- Preço de custo
- Preço de venda
- Preço de atacado
- Margem de lucro

Clientes

- Cadastro completo
- CPF
- Telefone
- Endereço
- Limite de crédito
- Saldo devedor

Caixa / PDV

- Busca por nome ou código
- Carrinho de compras
- Múltiplas formas de pagamento
- Troco automático
- Impressão de cupom
- Venda fiada
- Vendas pendentes
- Controle de abertura e fechamento

Relatórios

- Vendas por período
- Vendas por hora
- Giro de estoque
- Fechamentos de caixa
- Sangrias
- Suprimentos
- Auditoria de estoque
- Contas a receber

---

Firebase

O projeto utiliza:

- Firebase Authentication
- Firebase Realtime Database

Configure o arquivo:

js/firebase-config.js

utilizando sua própria configuração do Firebase.

---

Instalação

1. Clone o projeto.

git clone <repositorio>

2. Configure o Firebase.

3. Publique em qualquer hospedagem estática:

- Firebase Hosting
- Netlify
- Vercel
- GitHub Pages
- Apache
- Nginx

---

Fluxo do Sistema

1. Login
2. Dashboard
3. Cadastro de Produtos
4. Cadastro de Clientes
5. Abertura do Caixa
6. Vendas
7. Impressão do Cupom
8. Controle Financeiro
9. Relatórios
10. Fechamento do Caixa

---

Funcionalidades Futuras

- NFC-e
- SAT Fiscal
- PIX por QR Code
- Integração com TEF
- Controle de usuários e permissões
- Backup automático
- Multiempresa
- Aplicativo para entregadores

---

Licença

Projeto privado.

Todos os direitos reservados.
