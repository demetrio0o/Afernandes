# Orçamentos — app de orçamentos de serviço

Funciona no celular (APK Android) e no computador (navegador).

## Como gerar o APK pelo GitHub

1. Crie um repositório no GitHub (pode ser privado) e envie **todos os arquivos desta pasta** (incluindo a pasta oculta `.github`).
2. **Troque a logo:** substitua o arquivo `logo.png` (na raiz) pela logo da empresa. Use PNG, de preferência quadrada e com fundo transparente. Ela vira o ícone do app, aparece na animação de abertura, no topo do app e no PDF.
3. No GitHub, abra a aba **Actions**. O fluxo "Gerar APK" roda sozinho a cada envio (ou clique em *Run workflow*). Leva uns 5 a 10 minutos.
4. Quando terminar, abra a execução e baixe **orcamentos-apk** em *Artifacts*. Dentro do zip está o `app-debug.apk`.
5. Passe o APK para o celular e instale (permita "instalar apps de fontes desconhecidas").

## Usar no computador

Precisa de Node.js: `npm install`, depois `npm start`, e abra o endereço que aparecer.

## Como usar o app

- **Materiais:** cadastre nome, valor, descrição e foto. Tipo "Cabo" é cobrado por metro. "Baixar materiais" gera um arquivo para enviar a outra pessoa; "Importar" carrega esse arquivo.
- **Cliente:** 1) dados do cliente, 2) materiais e metros de cabo, 3) valor do serviço e/ou hora técnica e total.
- **Salvos:** toque no cliente para baixar o PDF, editar ou excluir.
- Botões no topo: ⚙ configurações (nome da empresa e valor padrão da hora) e ◐ modo claro/escuro.

Os dados ficam salvos no aparelho. Apagar os dados do app apaga os orçamentos.
