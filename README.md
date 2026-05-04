# SistemaOuvir

Interface auditiva por toque em **Vanilla JS** — transforma qualquer site em uma experiência acessível onde o usuário descobre elementos deslizando o dedo (ou o mouse) pela tela e ouve o nome/descrição de cada um em voz alta.

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

## Extensão para Chrome (Manifest V3)

A pasta `chrome-extension/` contém uma extensão pronta que injeta o SistemaOuvir em **qualquer site** sem precisar alterar o código do site.

### Estrutura

```
chrome-extension/
├── manifest.json      # Manifest V3 – permissões: activeTab, storage, scripting
├── content.js         # Lógica principal injetada em todas as páginas
├── background.js      # Service worker – gerencia estado por aba e ícone
├── popup.html         # Interface do popup com liga/desliga e configurações
├── popup.css          # Estilos do popup
├── popup.js           # Lógica do popup
└── icons/             # Ícones 16 / 48 / 128 px (azul=padrão, verde=ativo, cinza=inativo)
```

### Como instalar (modo desenvolvedor)

1. Abra o Chrome e acesse `chrome://extensions`.
2. Ative o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e selecione a pasta `chrome-extension/`.
4. O ícone 🔊 aparecerá na barra de ferramentas.

### Como usar

- Clique no ícone para abrir o popup.
- Use o **toggle** para ativar/desativar na aba atual.
- Ajuste **velocidade**, **tom**, **idioma** e **delay** conforme necessário.
- As configurações são salvas automaticamente em `chrome.storage.sync`.

### Permissões utilizadas

| Permissão | Motivo |
|---|---|
| `activeTab` | Permite interagir com a aba em foco |
| `storage` | Persiste configurações (velocidade, idioma, etc.) entre sessões |
| `scripting` | Injeta `content.js` dinamicamente quando necessário |
| `<all_urls>` | Ativa o content script em qualquer domínio |

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
├── chrome-extension/        # Extensão Chrome MV3 pronta para instalar
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
