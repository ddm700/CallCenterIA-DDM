# Documentação do Projeto: Callcenter IA - DDM

## 1. Visão Geral
O **Callcenter IA - DDM** (Data Driven Performance) é uma plataforma de gestão e automação de chamadas telefônicas utilizando Inteligência Artificial. A ferramenta se integra com a API da **VAPI** para realizar chamadas de voz com assistentes conversacionais (AI Voice Agents) e utiliza o **Supabase** como backend para armazenamento de dados, relatórios e controle de filas.

O objetivo principal é permitir a criação massiva e controle de campanhas de ligações ativas, fornecendo métricas detalhadas de desempenho, custos e qualidade em tempo real.

---

## 2. Funcionalidades Principais (Módulos)

### 2.1. Dashboard de Campanhas (`/`)
*   **KPIs Globais**: Visualização agregada de campanhas ativas, contatos totais processados e pendentes.
*   **KPI de Eficiência Global**: Calcula o percentual de contatos concluídos com sucesso em relação ao total da base.
*   **Gerenciamento de Campanhas**:
    *   Criação e edição de campanhas (Nome, Instituição, Tipo: VAPI/WhatsApp).
    *   Configuração técnica: ID do Assistente VAPI, ID da Linha Telefônica, Máximo de Tentativas, Intervalo de Rediscagem (minutos).
    *   Janela de Operação: Definição de horários de início e fim.
    *   Controle de Concorrência: Definição de ligações simultâneas.
*   **Controle de Execução**: Botões "Play" e "Pause" para iniciar/parar o disparador de chamadas de cada campanha.
*   **Status Visual**: Badges indicativos (Ativa, Concluída, Pausada).

### 2.2. Gestão de Contatos (`/contacts`)
*   **Importação em Massa**: Upload de planilhas `.xlsx` ou `.csv` para alimentar campanhas.
    *   Colunas esperadas: `nome`, `telefone`, `cpf`, `instituicao`.
*   **Cadastro Manual**: Adição individual de leads a uma campanha específica.
*   **Ações Individuais**:
    *   **Ligar Agora**: Disparo unitário imediato para um contato específico (fura-fila).
    *   **Resetar**: Zerar contadores de tentativas e status para rediscar para um contato que falhou.
    *   **Editar/Excluir**: Correção de dados cadastrais ou remoção da base.
*   **Filtros**: Busca por nome, CPF ou telefone e filtragem por campanha.

### 2.3. Monitoramento de Ligações (`/calls`)
*   **Live Operations Dashboard** (Novo): Centros de métricas em tempo real no topo da tela:
    *   **Chamadas Hoje**: Volume diário acumulado.
    *   **Em Curso**: Indicador pulsante de chamadas ativas no momento.
    *   **Taxa de Alô**: Percentual de atendimento humano vs. máquinas.
    *   **Caixa Postal**: Taxa de detecção de voicemail.
*   **Histórico Completo**: Tabela detalhada de todas as chamadas realizadas.
*   **Filtros Avançados**:
    *   Por Campanha, Cliente, Status (Concluída, Falhou) e Data.
*   **Gravações**: Player de áudio integrado para ouvir a gravação da chamada (se disponível na VAPI).
*   **Detalhamento**: Modal com logs da chamada, transcrição, e JSON de análise da IA.

### 2.4. Relatórios Analíticos (`/reports`)
*   **KPIs Financeiros e Operacionais**:
    *   Taxa de Contato e Taxa de Sucesso.
    *   Duração Média das chamadas (TMO).
    *   Custo Total acumulado.
*   **Gráficos (Data Visualization)**:
    *   **Funil de Conversão**: Barras visuais do fluxo de contatos.
    *   **Motivos de Término**: Gráfico de pizza (ex: user-ended-call, silence-timeout).
    *   **Atividade Diária**: Linha do tempo de volume de chamadas.
    *   **Evolução de Custos**: Acompanhamento de gastos diários.

### 2.5. Qualidade (`/quality`)
*   **Score de Qualidade**: Baseado em análise de IA das transcrições.
*   **Métricas**:
    *   **NPS (Net Promoter Score)** e Rating Médio (0-10).
    *   **Distribuição**: Promotores vs Detratores.
*   **Rank de Objeções**: Lista das principais resistências dos clientes (ex: "Sem interesse", "Já possui plano"), extraídas automaticamente via análise semântica.
*   **Score por Campanha**: Comparativo de performance de qualidade entre diferentes campanhas.

### 2.6. Logs do Sistema (`/logs`)
*   Monitoramento técnico de erros de integração, falhas de banco de dados ou problemas na API da VAPI, útil para depuração (Debugging).

---

## 3. Arquitetura Técnica

### 3.1. Frontend
*   **Framework**: React (Vite) com TypeScript.
*   **Estilização**: Tailwind CSS v3.
    *   **Design System "Tech/Sharp"**: Identidade visual focada em alta densidade de informação, cores sóbrias (Slate/Dark), contrastes Neon (Laranja/Verde) e tipografia Inter/Mono.
    *   **Temas**: Suporte nativo a Light/Dark Mode.
*   **Componentes Gráficos**: Recharts (para gráficos) e Lucide React (ícones).
*   **Roteamento**: React Router DOM.

### 3.2. Backend & Serviços
*   **Banco de Dados**: Supabase (PostgreSQL).
    *   Tabelas principais: `campaigns`, `contacts`, `campaign_contacts`, `calls`.
    *   Views para Analytics: `vw_report_kpis`, `vw_quality_metrics`, etc.
*   **Telefonia & IA**: Integração com API VAPI.ai.
    *   O frontend dispara requisições para endpoints da VAPI para iniciar chamadas.
    *   Webhooks (presumidos no backend/n8n) alimentam o Supabase com o status das chamadas.

### 3.3. Fluxo de Dados
1.  **Input**: Usuário cria campanha e importa contatos no Frontend.
2.  **Armazenamento**: Dados salvos no Supabase.
3.  **Execução**:
    *   Serviço de disparo lê contatos pendentes do Supabase.
    *   Aciona API da VAPI (`POST /call`).
4.  **Feedback**:
    *   VAPI processa a voz e gera eventos.
    *   VAPI envia dados (custo, gravação, transcrição) de volta para o sistema.
5.  **Visualização**: Frontend consome dados atualizados do Supabase para gerar Dashboards.

---

## 4. Estrutura de Dados (Core Types)

### Campaign (`Campaign`)
*   `id`, `name`, `type` (VAPI/WhatsApp).
*   `vapi_assistant_id`, `vapi_phone_id`.
*   `status` (Active, Paused), `maxAttempts`.
*   Métricas calculadas: `totalContacts`, `completedContacts`, `successRate`.

### Call (`Call`)
*   `id`, `vapiCallId`.
*   `status` (Concluída, Falhou, Em andamento).
*   `duration`, `cost` (detalhado por STT, TTS, Vapi).
*   `recordingUrl`, `transcript`, `summary`.
*   `analysis`: Objeto JSON com extração de dados da conversa.

### Contact (`Contact`)
*   `id`, `name`, `phone`, `cpf`.
*   Link com Campanha (`campaignId`).
*   `status` (pendente, em_andamento, concluido).
*   `attempts` (contador de tentativas de contato).

---

## 5. Guia de Integração (VAPI)

Para que o sistema funcione, é necessário configurar as credenciais da VAPI:
1.  **API Key**: Chave privada para autenticação das requisições.
2.  **Assistant ID**: Identificador do agente de voz (criado no painel VAPI) que contém o Prompt do sistema e configurações de voz.
3.  **Phone ID**: Número de telefone (SIP/Twilio) vinculado à conta VAPI.

Esses IDs são inseridos no momento da criação da campanha, permitindo que diferentes campanhas usem diferentes "personas" (Assistentes) ou números de origem.

---

> Documentação gerada automaticamente pela IA Auxiliar (Antigravity) em 25/01/2026.
