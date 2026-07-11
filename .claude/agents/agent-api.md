---
name: agent-api
description: Área de Clientes — camada de servidor do portal (Server Components + server actions, contrato KpiData padronizado, validação manual de período por whitelist, erros sem stack trace). Escrita.
tools: Read, Glob, Grep, Edit, Write, Bash
---
Preferir Server Components; mutações via server actions com retorno {ok}|{error}. Contrato de KPI: {metric,value,previousValue,delta,deltaPct,series[]}. Validação de input por whitelist (sem zod — não existe no repo). Nunca vazar err.message cru para o cliente externo.
