# +Voz – SistemaOuvir

Interface auditiva por toque em **Vanilla JS** — transforma qualquer site em uma experiência acessível onde o usuário descobre elementos deslizando o dedo (ou o mouse) pela tela e ouve o nome/descrição de cada um em voz alta.

**+Voz: Inclusão que se ouve.** 🔊

---

## Funcionalidades

| Recurso | Detalhes |
|---|---|
| **Detecção de elementos** | `touchmove` (mobile) + `mousemove` (desktop) com `document.elementFromPoint` |
| **Leitura inteligente** | Prioridade: `aria-label` → `aria-labelledby` → `alt` (img) → `title` → texto interno |
| **Suporte a formulários** | Lê `<input>`, `<select>` com seus `<label>` associados |
| **Confirmação de campos** | Ao sair de um campo preenchido, lê o valor em voz alta: *"Nome completo: João Silva. Está correto?"* |
| **Campos numéricos** | CPF, CNPJ, telefone e CEP têm cada dígito lido individualmente para fácil conferência |
| **Confirmação de select** | Ao trocar de opção em `<select>`, anuncia imediatamente a opção escolhida |
| **Síntese de voz** | Web Speech API (`window.speechSynthesis`), sem dependências externas |
| **Debounce de 100 ms** | Só fala quando o elemento muda **e** o dedo para por ≥ 100 ms |
| **Feedback visual** | Borda laranja temporária no elemento detectado |
| **Reset ao soltar** | `touchend` / `mouseup` redefine o estado para re-leitura no mesmo elemento |

---

## Como usar

### 1. Adicionar a qualquer site (forma mais simples)

Cole a tag `<script>` **antes do `</body>`** do seu HTML:

```html
<script src="sistemaOuvir.js"></script>
```

Se preferir hospedar o arquivo, faça o upload de `sistemaOuvir.js` para o servidor (ou CDN) e ajuste o caminho no `src`.

### 2. Via CDN / URL pública (GitHub Pages, jsDelivr, etc.)

Exemplo usando jsDelivr (substitua `SEU_USUARIO` pelo seu usuário do GitHub e `main` pelo nome da sua branch):

```html
<script src="https://cdn.jsdelivr.net/gh/SEU_USUARIO/SistemaOuvir@main/sistemaOuvir.js"></script>
```

### 3. Injetar via console do navegador (teste sem alterar o código)

> Substitua `SEU_USUARIO` pelo seu usuário do GitHub e `main` pelo nome da sua branch.

```js
const s = document.createElement('script');
s.src = 'https://cdn.jsdelivr.net/gh/SEU_USUARIO/SistemaOuvir@main/sistemaOuvir.js';
document.head.appendChild(s);
```

### 4. Passo a passo para adicionar ao seu site

1. **Baixe** o arquivo `sistemaOuvir.js` deste repositório (botão *Code → Download ZIP* ou copie o conteúdo do arquivo).
2. **Coloque** o arquivo na mesma pasta do seu `index.html` (ou em uma subpasta, ex.: `js/sistemaOuvir.js`).
3. **Adicione** a linha abaixo antes do fechamento da tag `</body>` em todas as páginas que devem ter acessibilidade auditiva:
   ```html
   <script src="sistemaOuvir.js"></script>
   ```
4. **Abra** a página no navegador. O sistema já está ativo — nenhuma configuração adicional é necessária.
5. **Teste:** passe o mouse (ou o dedo) sobre os elementos e preencha os campos do formulário.

> ⚠️ **Atenção:** o Web Speech API requer **HTTPS** em produção (ou `localhost` para testes locais). Sites servidos via `http://` não conseguirão sintetizar voz.

---

## Confirmação de campos — como funciona

Quando o usuário **preenche um campo e clica fora** (ou pressiona Tab), o SistemaOuvir:

1. Detecta automaticamente o tipo do campo pelo `id`, `name`, `placeholder` ou `<label>` associado.
2. Formata o valor conforme o tipo:
   - **Nome, e-mail, texto livre:** lê o valor diretamente.
   - **CPF, CNPJ, telefone, CEP:** lê cada dígito individualmente para facilitar a conferência.
3. Anuncia: *"&lt;Rótulo do campo&gt;: &lt;valor&gt;. Está correto?"*

Para que a detecção automática funcione, use palavras-chave nos atributos `id`, `name`, `placeholder` ou `<label>`:

| Tipo detectado | Palavras-chave reconhecidas |
|---|---|
| CPF | `cpf` |
| CNPJ | `cnpj` |
| Telefone | `telefone`, `celular`, `whatsapp`, `fone`, `tel`, `phone` |
| CEP | `cep` |

---

## Extensão +Voz para Chrome (Manifest V3)

A pasta `chrome-extension/` contém a extensão **+Voz** pronta, que injeta o SistemaOuvir em **qualquer site** sem precisar alterar o código do site.

### Estrutura

```
chrome-extension/
├── manifest.json      # Manifest V3 – permissões: activeTab, storage, scripting
├── content.js         # Lógica principal injetada em todas as páginas
├── background.js      # Service worker – gerencia estado por aba, ícone e boas-vindas
├── popup.html         # Interface do popup com liga/desliga e configurações
├── popup.css          # Estilos do popup
├── popup.js           # Lógica do popup
├── welcome.html       # Página de boas-vindas (aberta automaticamente na 1ª instalação)
├── welcome.css        # Estilos da página de boas-vindas
├── widget.js          # Widget flutuante para sites de terceiros
└── icons/             # Ícones 16 / 48 / 128 px (+Voz=padrão, on=ativo, off=inativo)
```

### Como instalar (modo desenvolvedor)

1. Abra o Chrome e acesse `chrome://extensions`.
2. Ative o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e selecione a pasta `chrome-extension/`.
4. O ícone **+Voz** aparecerá na barra de ferramentas.
5. A **página de boas-vindas** abrirá automaticamente na primeira instalação.

### Como usar a extensão

1. **Ativar**: Clique no ícone +Voz na barra de ferramentas para abrir o popup e ligue o **toggle** na aba desejada.
2. **Usar**: Deslize o mouse (ou o dedo, no mobile) sobre textos, botões, imagens e campos da página — o +Voz lerá a descrição de cada elemento em voz alta.
3. **Ajustar**: No popup, use os controles de **velocidade**, **tom**, **idioma** e **delay** conforme necessário. As configurações são salvas automaticamente em `chrome.storage.sync`.

### Permissões utilizadas

| Permissão | Motivo |
|---|---|
| `activeTab` | Permite interagir com a aba em foco |
| `storage` | Persiste configurações (velocidade, idioma, etc.) entre sessões |
| `scripting` | Injeta `content.js` dinamicamente quando necessário |
| `<all_urls>` | Ativa o content script em qualquer domínio |

---

## Página de Boas-Vindas (Onboarding)

Ao instalar a extensão pela **primeira vez**, a página `welcome.html` é aberta automaticamente, guiando o usuário em 3 passos simples:

1. **Ative pelo ícone** da barra de ferramentas.
2. **Deslize sobre os textos** para ouvir as descrições.
3. **Ajuste a velocidade** no menu popup.

A página inclui um botão **"🔊 Testar Agora"** que direciona para uma página de exemplo com formulários e textos para o usuário experimentar o +Voz imediatamente.

> Para abrir a página de boas-vindas manualmente (após a instalação), navegue para:
> ```
> chrome-extension://<ID_DA_EXTENSÃO>/welcome.html
> ```
> O ID aparece em `chrome://extensions` após carregar a extensão.

---

## Widget Flutuante para Sites de Terceiros

O arquivo `widget.js` injeta um **botão flutuante** no canto inferior direito de qualquer página, permitindo que usuários finais ativem/desativem o SistemaOuvir sem precisar da extensão Chrome.

### Como usar o widget

1. Adicione os dois scripts antes do `</body>` no seu HTML:

```html
<script src="sistemaOuvir.js"></script>
<script src="widget.js"></script>
```

2. Ou usando CDN (substitua `SEU_USUARIO` e `main` pelo seu usuário GitHub e branch):

```html
<script src="https://cdn.jsdelivr.net/gh/SEU_USUARIO/SistemaOuvir@main/sistemaOuvir.js"></script>
<script src="https://cdn.jsdelivr.net/gh/SEU_USUARIO/SistemaOuvir@main/chrome-extension/widget.js"></script>
```

### Comportamento do widget

- Exibe um **círculo laranja** com o símbolo **+Voz** (branco) no canto inferior direito.
- Ao passar o mouse, o botão se **expande suavemente** mostrando o texto "Acessibilidade Ativa".
- Ao clicar, chama `window.SistemaOuvir.toggle()` e **muda de cor** (laranja → azul) para indicar que está ativo.
- Totalmente acessível via teclado (`Tab` + `Enter`/`Space`) com foco visual visível.

---

## API pública (sistemaOuvir.js)

Quando o script é carregado diretamente em um site, ele expõe `window.SistemaOuvir`:

```js
SistemaOuvir.enable()              // ativa o sistema
SistemaOuvir.disable()             // desativa o sistema
SistemaOuvir.toggle()              // alterna ativo/inativo
SistemaOuvir.isEnabled()           // retorna true/false
SistemaOuvir.config({ rate: 1.2, pitch: 1, lang: 'pt-BR', debounce: 150 })
```

---

## Estrutura do repositório

```
SistemaOuvir/
├── sistemaOuvir.js          # Script principal (injete em qualquer site)
├── demo.html                # Página de demonstração com todos os tipos de elemento
├── chrome-extension/        # Extensão +Voz para Chrome MV3 pronta para instalar
└── README.md
```

---

## Compatibilidade

- Chrome / Edge 33+ ✅  
- Safari 14.1+ (iOS 14.5+) ✅  
- Firefox 49+ ✅  
- Requer HTTPS ou `localhost` para o Web Speech API funcionar em produção.

---

## Inspiração

Sistema baseado na abordagem de leitura de elementos por deslizamento de tela, com melhorias na detecção de contexto semântico (ARIA, labels, roles) e feedback visual de acessibilidade.
