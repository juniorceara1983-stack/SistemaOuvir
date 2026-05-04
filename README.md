# SistemaOuvir

Interface auditiva por toque em **Vanilla JS** — transforma qualquer site em uma experiência acessível onde o usuário descobre elementos deslizando o dedo (ou o mouse) pela tela e ouve o nome/descrição de cada um em voz alta.

---

## Funcionalidades

| Recurso | Detalhes |
|---|---|
| **Detecção de elementos** | `touchmove` (mobile) + `mousemove` (desktop) com `document.elementFromPoint` |
| **Leitura inteligente** | Prioridade: `aria-label` → `aria-labelledby` → `alt` (img) → `title` → texto interno |
| **Suporte a formulários** | Lê `<input>`, `<select>` com seus `<label>` associados |
| **Síntese de voz** | Web Speech API (`window.speechSynthesis`), sem dependências externas |
| **Debounce de 100 ms** | Só fala quando o elemento muda **e** o dedo para por ≥ 100 ms |
| **Feedback visual** | Borda laranja temporária no elemento detectado |
| **Reset ao soltar** | `touchend` / `mouseup` redefine o estado para re-leitura no mesmo elemento |

---

## Como usar

### 1. Adicionar ao HTML

```html
<!-- Antes do </body> -->
<script src="sistemaOuvir.js"></script>
```

### 2. Injetar via console (teste rápido)

```js
// Cole no console do DevTools:
const s = document.createElement('script');
s.src = 'sistemaOuvir.js';
document.head.appendChild(s);
```

### 3. Demo local

Abra `demo.html` em qualquer navegador moderno e mova o mouse sobre os elementos.

---

## Estrutura do repositório

```
SistemaOuvir/
├── sistemaOuvir.js   # Script principal (injete em qualquer site)
├── demo.html         # Página de demonstração com todos os tipos de elemento
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
