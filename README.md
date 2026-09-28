# PDV Idealize

Sistema de vendas das Óticas Idealize: vendas, ordens de serviço, receita e recebimentos.
Front em React + Tailwind + Radix + Framer Motion, banco no Supabase (projeto `pdv-idealize`, schema `pdv`).

## Rodar no computador

Pré-requisito: Node.js 20 ou superior (https://nodejs.org).

```bash
npm install
npm run dev
```

Abra http://localhost:5173 e entre com seu usuário e senha.

## Publicar (Vercel)

1. Suba esta pasta para um repositório no GitHub.
2. Em vercel.com → Add New → Project → importe o repositório.
3. Em Environment Variables, cadastre `VITE_SUPABASE_URL` e `VITE_SUPABASE_KEY` (valores do arquivo `.env`).
4. Deploy. O `vercel.json` já cuida das rotas.

## Estrutura

- `src/pages` — Vendas, Nova venda, Detalhe da venda (recebimentos), Lentes e preços (admin)
- `src/features/venda` — cliente, receita (OD/OE), armação, lentes, OS
- `src/features/recebimento` — formas de pagamento e parcelas
- `src/lib` — conexão Supabase, login por usuário, formatação e validação de receita

## Regras que ficam no banco (não no front)

- Preço do item sempre vem do cadastro do produto
- Receita validada: passos de 0,25, eixo 0–180, cilíndrico exige eixo
- Venda confirmada não aceita alteração de itens
- Recebimento não pode passar do saldo
- Cada vendedora vê só a própria loja; admin vê todas
- Eventos para lab e ADM gravados em `pdv.eventos_outbox`

A chave em `.env` é a chave publicável do Supabase: pode ficar no front com segurança,
porque o acesso aos dados é controlado pelas regras de RLS do banco.
