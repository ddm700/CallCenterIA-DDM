import React from 'react';
import { Modal, Badge } from './ui';
import { Call } from '../types';
import { Clock, Phone, User, FileText, Activity, DollarSign, Calendar, MessageSquare, Play, Volume2 } from 'lucide-react';

interface CallDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  call: Call | null;
}

export const CallDetailsModal: React.FC<CallDetailsModalProps> = ({ isOpen, onClose, call }) => {
  if (!call) return null;

  // Extract analysis data safely
  const analysis = call.analysis || {};
  const extractedData = analysis.structuredData || {};
  
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
              <p className="font-medium text-slate-900 dark:text-white">{call.clientName}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">CPF</p>
              <p className="font-medium text-slate-900 dark:text-white">{(call as any).cpf || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Campanha</p>
              <p className="font-medium text-slate-900 dark:text-white">{call.campaignName}</p>
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
              <p className="font-medium text-slate-900 dark:text-white">{call.reason}</p>
            </div>
          </div>
        </div>

        {/* Resumo da Conversa */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" /> Resumo da Conversa
          </h4>
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            {call.summary || analysis.summary || "Resumo indisponível."}
          </p>
        </div>

        {/* Informações Extraídas (Cards) */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
           <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4" /> Informações Extraídas
          </h4>
          <div className="space-y-4">
            
            {/* Success Evaluation */}
            <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
               <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Resultado da Avaliação</p>
               <div className="flex items-center gap-2 mb-2">
                  <Badge variant={call.success ? 'success' : 'neutral'}>
                     {call.success ? 'Sucesso' : 'Sem Sucesso / Neutro'}
                  </Badge>
               </div>
               <p className="text-sm text-slate-700 dark:text-slate-300">
                 {analysis.successEvaluation || "Nenhuma avaliação detalhada disponível."}
               </p>
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

        {/* Custos */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <div className="flex items-center gap-2">
             <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
             <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Análise de Custos</h4>
          </div>
          <div className="text-right">
             <p className="text-xs text-slate-500 dark:text-slate-400">Custo Total</p>
             <p className="text-xl font-bold text-slate-900 dark:text-white">R$ {call.cost.toFixed(2)}</p>
          </div>
        </div>

      </div>
    </Modal>
  );
};
