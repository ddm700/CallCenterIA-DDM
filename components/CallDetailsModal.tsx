import React from 'react';
import { Modal, Badge } from './ui';
import { Call } from '../types';
import { Clock, Phone, User, FileText, Activity, DollarSign, Calendar, MessageSquare, Play, Volume2, Mic, Speaker, Server } from 'lucide-react';

interface CallDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  call: Call | null;
}

// Simple markdown to HTML converter
const renderMarkdown = (text: string): React.ReactElement => {
  if (!text) return <></>;

  // Split by lines and process each
  const lines = text.split('\n');
  const elements: React.ReactElement[] = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Skip empty lines
    if (!line.trim()) {
      elements.push(<br key={key++} />);
      continue;
    }

    // Headers (### Title)
    if (line.startsWith('###')) {
      const content = line.replace(/^###\s*/, '');
      elements.push(
        <h3 key={key++} className="font-semibold text-base text-slate-900 dark:text-white mt-3 mb-2">
          {content}
        </h3>
      );
      continue;
    }

    // Horizontal rule (---)
    if (line.trim() === '---') {
      elements.push(<hr key={key++} className="my-3 border-slate-200 dark:border-slate-700" />);
      continue;
    }

    // Process inline markdown (bold, italic)
    const processInline = (text: string): (string | React.ReactElement)[] => {
      const parts: (string | React.ReactElement)[] = [];
      let remaining = text;
      let partKey = 0;

      // Bold (**text**)
      const boldRegex = /\*\*([^*]+)\*\*/g;
      let lastIndex = 0;
      let match;

      while ((match = boldRegex.exec(remaining)) !== null) {
        // Add text before match
        if (match.index > lastIndex) {
          parts.push(remaining.substring(lastIndex, match.index));
        }
        // Add bold text
        parts.push(
          <strong key={`bold-${partKey++}`} className="font-semibold text-slate-900 dark:text-white">
            {match[1]}
          </strong>
        );
        lastIndex = match.index + match[0].length;
      }

      // Add remaining text
      if (lastIndex < remaining.length) {
        parts.push(remaining.substring(lastIndex));
      }

      return parts.length > 0 ? parts : [text];
    };

    // List items (- text)
    if (line.trim().startsWith('-')) {
      const content = line.replace(/^-\s*/, '');
      elements.push(
        <li key={key++} className="ml-4 mb-1 text-slate-700 dark:text-slate-300">
          {processInline(content)}
        </li>
      );
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={key++} className="mb-2 text-slate-700 dark:text-slate-300">
        {processInline(line)}
      </p>
    );
  }

  return <div className="space-y-1">{elements}</div>;
};

export const CallDetailsModal: React.FC<CallDetailsModalProps> = ({ isOpen, onClose, call }) => {
  if (!call) return null;

  // Extract analysis data safely
  const analysis = call.analysis || {};
  const extractedData = analysis.structuredData || {};

  // Extract cost details from call object (now properly typed)
  const custoSTT = call.custo_stt || 0;
  const custoTTS = call.custo_tts || 0;
  const custoVAPI = call.custo_vapi || 0;
  const custoTotal = call.custo_total || call.cost || 0;

  // --- Translation helper (English → Portuguese-BR) ---
  const translateToPtBR = (text: string): string => {
    if (!text) return text;
    // Heuristic: only translate if likely English
    const isEnglish = /\b(the|and|was|from|called|contact|about|payment|balance|course|their|she|he|they|could|would|for|with|not|had|has|have|offered|stated|scheduled|pending|regarding|installments|follow-up|informed|confirmation|assessment|team)\b/i.test(text);
    if (!isEnglish) return text;

    return text
      // People & roles
      .replace(/\bcalled\b/gi, 'ligou para')
      .replace(/\bcontacted\b/gi, 'entrou em contato com')
      .replace(/\brepresenting\b/gi, 'representando')
      .replace(/\bassessment team\b/gi, 'equipe de cobrança')

      // Financial
      .replace(/\bpending balance\b/gi, 'saldo pendente')
      .replace(/\boutstanding (debt|balance)\b/gi, 'débito em aberto')
      .replace(/\bpayment options?\b/gi, 'opções de pagamento')
      .replace(/\binstallments?\b/gi, 'parcelas')
      .replace(/\bvia card\b/gi, 'via cartão')
      .replace(/\bboleto\b/gi, 'boleto')
      .replace(/\bThe debt amounts? to\b/gi, 'O débito é de')
      .replace(/\bpay\b/gi, 'pagar')
      .replace(/\bpayment\b/gi, 'pagamento')

      // Call outcomes
      .replace(/\bscheduled a follow-?up call\b/gi, 'agendou um retorno de chamada')
      .replace(/\bfor the following week\b/gi, 'para a semana seguinte')
      .replace(/\bThe call ended (shortly after|after)\b/gi, 'A chamada foi encerrada logo após')
      .replace(/\bThe user stated (they|he|she) could not\b/gi, 'O cliente informou que não poderia')
      .replace(/\bShe offered\b/gi, 'Foi oferecido')
      .replace(/\bHe offered\b/gi, 'Foi oferecido')
      .replace(/\boffered\b/gi, 'ofereceu')
      .replace(/\binformed\b/gi, 'informou')
      .replace(/\bregarding\b/gi, 'sobre')
      .replace(/\bconfirmation\b/gi, 'confirmação')
      .replace(/\bcourse\b/gi, 'curso')
      .replace(/\btheir\b/gi, 'seu')
      .replace(/\btoday\b/gi, 'hoje')

      // Generic
      .replace(/\bwas conveyed\b/gi, 'foi transmitida')
      .replace(/\bwas informed\b/gi, 'foi informado');
  };

  // --- successEvaluation → pt-BR label ---
  const rawEval = call.raw_success_evaluation ?? String(call.success_evaluation ?? '');
  const isSuccess = rawEval.toLowerCase() === 'true' || rawEval === '1' || call.success;

  const successLabel = (() => {
    if (call.structured_rating_label) return call.structured_rating_label;
    if (isSuccess) return 'Sucesso';
    // Map common VAPI values
    if (rawEval.toLowerCase() === 'false') return 'Sem Sucesso';
    if (rawEval.toLowerCase() === 'unknown') return 'Inconclusivo';
    return 'Sem Sucesso / Neutro';
  })();

  // --- Summary: prefer metadata_raw, fallback to existing fields ---
  const summary = translateToPtBR(
    call.raw_summary || call.summary || analysis.summary || ''
  );

  // Evaluation detail text
  const structuredEvaluation = call.structured_rating_text || analysis.successEvaluation || '';
  const evaluationLabel = successLabel;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Detalhes da Ligação"
      maxWidth="max-w-4xl"
    >
      <div className="space-y-6">

        {/* Informações Gerais */}
        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4" /> Informações Gerais
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-y-4 gap-x-8">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Cliente</p>
              <p className="font-medium text-slate-900 dark:text-white">{call.clientName || 'Desconhecido'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">CPF</p>
              <p className="font-medium text-slate-900 dark:text-white">{call.cpf || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Campanha</p>
              <p className="font-medium text-slate-900 dark:text-white">{call.campaignName || 'Direta'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Status</p>
              <Badge variant={call.status === 'Concluída' ? 'success' : 'danger'}>{call.status}</Badge>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Telefone</p>
              <p className="font-medium text-slate-900 dark:text-white">{call.phone}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Duração</p>
              <p className="font-medium text-slate-900 dark:text-white">{call.duration}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Data/Hora</p>
              <p className="font-medium text-slate-900 dark:text-white">{call.date}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Motivo Término</p>
              <p className="font-medium text-slate-900 dark:text-white text-xs">{call.reason}</p>
            </div>
          </div>
        </div>

        {/* Resumo da Conversa */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" /> Resumo da Conversa
          </h4>
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            {summary || "Resumo indisponível."}
          </p>
        </div>

        {/* Informações Extraídas (Cards) */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4" /> Informações Extraídas
          </h4>
          <div className="space-y-4">

            {/* Success Evaluation - Using structured data */}
            <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Resultado da Avaliação</p>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant={isSuccess ? 'success' : 'neutral'}>
                  {evaluationLabel}
                </Badge>
                {call.structured_name && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    ({call.structured_name})
                  </span>
                )}
              </div>
              <div className="text-sm">
                {structuredEvaluation ? renderMarkdown(structuredEvaluation) : (
                  <p className="text-slate-700 dark:text-slate-300">Nenhuma avaliação detalhada disponível.</p>
                )}
              </div>
            </div>

            {/* Custom Extraction Fields if any */}
            {(extractedData.userName || extractedData.userIntent) && (
              <div className="grid grid-cols-2 gap-4">
                {extractedData.userName && (
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Nome Identificado</p>
                    <p className="font-medium">{extractedData.userName}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Transcrição */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase mb-3 flex items-center gap-2">
            <MessageSquare className="w-4 h-4" /> Transcrição Completa
          </h4>
          <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg max-h-60 overflow-y-auto font-mono text-sm border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
            {call.transcript || "Transcrição não disponível."}
          </div>
        </div>

        {/* Player de Áudio */}
        {call.recordingUrl && (
          <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
            <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase mb-3 flex items-center gap-2">
              <Volume2 className="w-4 h-4" /> Gravação de Áudio
            </h4>
            <div className="bg-slate-100 dark:bg-slate-700 p-3 rounded-lg">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Gravação Mono/Estéreo</p>
              <audio controls className="w-full h-10">
                <source src={call.recordingUrl} type="audio/wav" />
                <source src={call.recordingUrl} type="audio/mp3" />
                Seu navegador não suporta o elemento de áudio.
              </audio>
            </div>
          </div>
        )}

        {/* Custos Detalhados */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Análise de Custos</h4>
          </div>

          {/* Breakdown de Custos */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-1">
                <Mic className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">STT (Transcrição)</p>
              </div>
              <p className="text-lg font-bold text-blue-900 dark:text-blue-100">R$ {custoSTT.toFixed(4)}</p>
            </div>

            <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
              <div className="flex items-center gap-2 mb-1">
                <Speaker className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">TTS (Voz)</p>
              </div>
              <p className="text-lg font-bold text-purple-900 dark:text-purple-100">R$ {custoTTS.toFixed(4)}</p>
            </div>

            <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
              <div className="flex items-center gap-2 mb-1">
                <Server className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">VAPI (Serviço)</p>
              </div>
              <p className="text-lg font-bold text-orange-900 dark:text-orange-100">R$ {custoVAPI.toFixed(4)}</p>
            </div>

            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-green-600 dark:text-green-400" />
                <p className="text-xs text-green-600 dark:text-green-400 font-medium">Total</p>
              </div>
              <p className="text-lg font-bold text-green-900 dark:text-green-100">R$ {custoTotal.toFixed(2)}</p>
            </div>
          </div>

          {/* Barra de Progresso Visual */}
          <div className="mt-4">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Distribuição de Custos</p>
            <div className="flex h-3 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700">
              <div
                className="bg-blue-500"
                style={{ width: `${(custoSTT / custoTotal) * 100}%` }}
                title={`STT: ${((custoSTT / custoTotal) * 100).toFixed(1)}%`}
              />
              <div
                className="bg-purple-500"
                style={{ width: `${(custoTTS / custoTotal) * 100}%` }}
                title={`TTS: ${((custoTTS / custoTotal) * 100).toFixed(1)}%`}
              />
              <div
                className="bg-orange-500"
                style={{ width: `${(custoVAPI / custoTotal) * 100}%` }}
                title={`VAPI: ${((custoVAPI / custoTotal) * 100).toFixed(1)}%`}
              />
            </div>
          </div>
        </div>

      </div>
    </Modal>
  );
};
