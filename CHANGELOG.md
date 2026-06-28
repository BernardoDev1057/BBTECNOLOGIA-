
# Changelog

Todas as alterações importantes deste projeto serão documentadas neste arquivo.

O formato segue o padrão Keep a Changelog e utiliza Versionamento Semântico (SemVer).

# [1.3.1] - 2026-06-28

## Corrigido
- Padronizada a leitura dos itens das vendas utilizando os campos `descricao` e `quantidade`.
- Corrigida a exibição dos produtos:
  - Resumo das vendas.
  - Detalhes da venda.
  - Emissão de cupons/comprovantes.

## Melhorado
- Atualizado o layout de impressão dos comprovantes.
- Alterada a fonte de `Courier New` para `Arial`, proporcionando melhor legibilidade.
- Aumentado o tamanho da fonte do corpo do comprovante.
- Aumentado o tamanho do título da impressão.
- Aumentado o tamanho da fonte da data impressa no rodapé.

## Compatibilidade
- Mantida compatibilidade com os registros atuais de vendas.
- Ajustada a interface para refletir corretamente a nova estrutura dos itens armazenados.

## [1.3.0] - 2026-06-28

### 🚀 Adicionado
- Modal unificado para cadastro de produtos
- Movimentação de estoque (entrada e saída)
- Análise de produto com gráfico Chart.js
- Impressão de etiquetas personalizadas
- Módulo `impressora.js` com função Etiqueta()
- Integração com vendas para cálculo de consumo real

### 🔧 Corrigido
- Correção no carregamento de itens da tabela vendas (itens[])
- Correção de inconsistência entre idProduto / produtoId / id
- Correção no fluxo de edição de produto
- Preenchimento seguro de campos no modal

### 📊 Melhorado
- Visual do ERP mais próximo de sistema comercial real
- Melhor rastreabilidade de estoque vs vendas
- Melhor UX no modal de operações

## [v1.2.0] - 2026-06-27

### ✨ Novidades
- Integração do envio de cobrança via WhatsApp diretamente pelo cadastro de clientes
- Adição de modal de envio de cupom/cobrança via WhatsApp com validação de telefone
- Implementação de fluxo seguro para abertura do WhatsApp com dados do cliente

### 🧾 Fluxo de Caixa
- Melhorias no controle de abertura e fechamento de caixa
- Cálculo mais preciso do valor esperado (vendas + suprimentos - sangrias + troco inicial)
- Registro de fechamento com diferença e justificativa
- Recarregamento automático e seguro após fechamento do caixa

### 💰 Vendas (PDV)
- Correção de erros no carrinho de compras (undefined e renderização)
- Ajuste no cálculo de total da venda em tempo real
- Melhoria no fluxo de pagamento com múltiplas formas (dinheiro, PIX, cartão, fiado)
- Correção no sistema de recuperação de vendas pendentes
- Estabilização do modal de recebimento

### 📦 Integrações
- Firebase: ajustes em leitura e atualização de vendas, clientes e caixa
- WhatsApp: padronização e correção da função de envio de mensagens

### 🐛 Correções
- Corrigido erro de `forEach` em carrinho vazio ou undefined
- Corrigido erro de `value undefined` em pagamentos
- Corrigido erro ao recuperar vendas pendentes
- Evitado crash ao renderizar carrinho sem itens

### 📌 Observações
- Sistema de PDV e caixa mais estável e preparado para operação contínua


## [v1.0.2] - 2026-06-27

### Alterações

- fix(caixa): adiciona telefone e endereço na venda pendente e corrige remoção
- fix(dashboard): corrige renderização e escuta de entregas pendentes
- fix(caixa): corrige abertura do modal de sangria utilizando data-attributes
- fix(pdv): anexa dados de contato do cliente no fluxo de vendas pendentes

---


## [v1.0.1] - 2026-06-27

### Alterações

- docs: Atualizado o changelog.md e version.json para versoes corretas
- release: v1.0.1
- feat: cria central de informações do sistema

---

---

## [v1.1.0] - 2026-06-27

### Adicionado

- Central de informações do sistema.
- Nova página "Sobre".
- Exibição da versão, build, commit, branch e release.
- Informações do ambiente de execução.
- Informações da sessão do usuário.
- Estatísticas do Firebase Realtime Database.


## [1.0.0] - 2026-06-27

Adicionado

- README do projeto.
- Licença proprietária.
- Suporte a vendas pendentes.
- Página completa de vendas.
- Impressão de cupons.
- Troca de cliente em vendas.
- Ajuste de preços em massa.
- Integração com WhatsApp para cobrança.
- Configuração de impressão.

Melhorias

- Novo layout utilizando Bootstrap.
- Melhorias nos relatórios.
- Melhorias na busca de produtos.
- Padronização de modais.
- Regra automática de preço de atacado.
- Exibição do valor do produto no PDV.
- Melhorias na autenticação Firebase.
- Atualização das regras do Firebase.
- Melhorias na interface do sistema.

Corrigido

- Correção do cálculo de troco.
- Correção dos modais.
- Correção do filtro de busca.
- Correção da autenticação Firebase.
- Diversas correções de estabilidade e usabilidade.

---

Histórico de desenvolvimento

v0.9.0

- Implementação das vendas pendentes.
- Alteração das informações exibidas nos produtos do PDV.

v0.8.0

- Melhorias nos relatórios.
- Correções relacionadas ao troco.

v0.7.0

- Implementação completa da tela de vendas.

v0.6.0

- Configuração da impressora.
- Correções na autenticação do Firebase.

v0.5.0

- Correções de modais.
- Padronização de preços de atacado.
- Melhorias na pesquisa de produtos.

v0.4.0

- Ajustes visuais.
- Página para alteração de preços em massa.

v0.3.0

- Integração com WhatsApp.
- Melhorias na cobrança de clientes.

v0.2.0

- Implementação da impressão.
- Atualização dos controles de sangria.

v0.1.0

- Migração completa do layout para Bootstrap.

v0.0.1

- Projeto inicial funcionando.
