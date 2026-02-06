# GeoDB Explorer — Trabalho Paradigmas

Este projeto integra programacao assincrona, concorrencia, paralelismo e programacao funcional usando a GeoDB Cities API e K-means.

## Requisitos
- Node.js (para rodar o servidor local com COOP/COEP)
- Chave da API RapidAPI (GeoDB Cities)

## Configuracao da API
Edite o arquivo:
- `config.js`

Preencha com sua chave:
```js
export const RAPID_API_KEY = "SUA_CHAVE_AQUI";
```

## Como rodar (necessario para SharedArrayBuffer)
O K-means usa memoria compartilhada e precisa de cross-origin isolation.

1. No terminal, dentro da pasta do projeto:
```bash
node server.js
```

2. Abra no navegador:
```
http://localhost:8080
```

## Etapa 1 — Exploracao e selecao
- Use o navegador de paginas para carregar cidades da API.
- Adicione cidades na lista de selecionadas.

## Etapa 1 — Gerar dataset 10k
- Clique em **Carregar 10.000**.
- O sistema usa Web Workers para buscar paginas em paralelo, respeitando limite de taxa.
- Ao final, um arquivo `cidades-10000.json` e baixado.

## Etapa 2 — K-means
- Abra `etapa2.html`.
- Carregue o JSON gerado (`cidades-10000.json`).
- Informe K e execute o agrupamento.

## Observacoes
- Sem `server.js` o navegador bloqueia o `SharedArrayBuffer`.
- Se ocorrer HTTP 429, reduza `workerCount` ou aumente `perRequestDelayMs` em `main.js`.
