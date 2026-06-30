# Performli — Estrutura de Agentes (Claude Code)

Sistema de subagents para desenvolver o Performli de forma segura, profunda e
sem quebrar produção. Baseado na frase-guia: **"Arkza em processo, não em memória."**

## Como instalar

1. Copie a pasta `.claude/` e o `CLAUDE.md` para a raiz do repositório
   `performli-sistema-geral`.
2. No Claude Code, rode `/agents` para confirmar que os 11 agentes foram
   reconhecidos.
3. Coloque `PERFORMLI_CONTEXTO.md`, `Arkza_Dossie_POPs.html` e as imagens da
   Ficha de Solução em `docs/` (ou na raiz).

## Agentes

| Agente | Papel | Permissão |
|---|---|---|
| `maestro` | Orquestra, mantém estado, valida gates | read-only |
| `auditor-codigo` | Audita o que já existe | read-only |
| `mapeador-pops` | Mapeia os 21 POPs + score 0.30 | read-only |
| `analista-lacunas` | Mapa de lacunas (gate de escopo) | read-only |
| `arquiteto-dados` | Propõe schema Prisma | read-only |
| `arquiteto-produto` | Especifica telas/cards | read-only |
| `backend-dal` | Implementa rotas/DAL | **escrita** |
| `frontend` | Implementa telas/componentes | **escrita** |
| `cron-automacao` | Implementa crons/alertas | **escrita** |
| `ia-rag` | Implementa camada de IA | **escrita** |
| `guardiao` | Gate segurança/QA/regressão | read-only |

> Auditor, arquitetos e guardião são **read-only de propósito** — não conseguem
> tocar no código, só inspecionar e reprovar. É uma trava real, não conceitual.

## Fluxo de uso

```
1. "Use o maestro para iniciar o diagnóstico do Performli"
2. maestro aciona auditor-codigo → mapeador-pops
3. maestro aciona analista-lacunas        [GATE escopo]
4. maestro aciona arquiteto-dados + arquiteto-produto   [GATE design]
5. maestro escolhe o POP #1 do ranking e aciona backend-dal + frontend
   (+ cron-automacao / ia-rag conforme a fatia)
6. guardiao revisa → APROVADO avança, REPROVADO volta ao agente
7. repete por fatia vertical (um POP completo de cada vez)
```

## Score de priorização (versão 0.30)

```
score_final =
    dependencia_marcos     * 0.30
  + risco_falha_silenciosa * 0.22
  + impacto_churn          * 0.20
  + valor_financeiro       * 0.13
  + volume_frequencia      * 0.10
  + chance_automacao       * 0.05
```

Privilegia processos que hoje só funcionam porque o Marcos lembra deles. É a
configuração mais agressiva para tirá-lo do papel de cérebro operacional.

## Fases

- **Fase 1** — Cockpit, catálogo de POPs, check-in semanal, fila CS, financeiro
  básico (MRR, contas a receber, inadimplência, margem), Client 360 básico.
- **Fase 2** — Termômetro semanal, anti-churn, War Room completo, escalação.
- **Fase 3** — CRM comercial, cadência de follow-up, contratos, comissões.
- **Fase 4** — Relatórios por IA, plano de ação, diagnóstico de War Room, copiloto.

A Fase 1 só está pronta quando o `guardiao` aprova o checklist de QA funcional.
