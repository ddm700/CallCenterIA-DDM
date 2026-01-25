import React, { useState, useEffect } from 'react';
import { Card, Badge, Input } from '../components/ui';
import { Search, Play, ExternalLink, XCircle, RefreshCw, Loader2 } from 'lucide-react';
import { Call } from '../types';
import { supabaseService } from '../services/supabaseService';
import { CallDetailsModal } from '../components/CallDetailsModal';

export const Calls: React.FC = () => {
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchCalls = async () => {
    setLoading(true);
    try {
      const data = await supabaseService.getCalls();
      setCalls(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalls();
  }, []);

  const handleOpenDetails = (call: Call) => {
    setSelectedCall(call);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Filters - Tech Control Panel */}
      <div className="bg-surface dark:bg-dark-surface p-5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm animate-fade-in">
        <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Search className="w-4 h-4" /> Filtros Avançados
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <select className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 focus:ring-1 focus:ring-primary focus:border-primary transition-shadow">
            <option>Todas as Campanhas</option>
          </select>
          <select className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 focus:ring-1 focus:ring-primary focus:border-primary transition-shadow">
            <option>Todos os Clientes</option>
          </select>
          <select className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 focus:ring-1 focus:ring-primary focus:border-primary transition-shadow">
            <option>Todos os Status</option>
          </select>
          <select className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 focus:ring-1 focus:ring-primary focus:border-primary transition-shadow">
            <option>Todas as Datas</option>
          </select>
        </div>
      </div>

      <div className="bg-surface dark:bg-dark-surface rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm animate-slide-up">
        <div className="p-5 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">Histórico</h2>
            <button
              onClick={fetchCalls}
              className="p-1.5 text-slate-400 hover:text-primary hover:bg-orange-50 dark:hover:bg-orange-900/10 rounded-md transition-all btn-click"
              title="Atualizar"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono">
            {calls.length} RECS
          </span>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-500 dark:text-slate-400">
            <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
            Carregando dados...
          </div>
        ) : calls.length === 0 ? (
          <div className="text-center py-12 text-slate-500 dark:text-slate-400">Nenhuma ligação encontrada.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/50 dark:bg-slate-800/50 text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3 first:pl-6">Data/Hora</th>
                  <th className="px-5 py-3">Campanha</th>
                  <th className="px-5 py-3">Cliente</th>
                  <th className="px-5 py-3">Telefone</th>
                  <th className="px-5 py-3 text-center">Duração</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Motivo</th>
                  <th className="px-5 py-3 text-center">Sucesso</th>
                  <th className="px-5 py-3 text-right">Custo</th>
                  <th className="px-5 py-3 text-right last:pr-6">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {calls.map((call) => (
                  <tr key={call.id} className="group hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-5 py-3.5 first:pl-6 font-mono text-xs text-slate-600 dark:text-slate-400">{call.date}</td>
                    <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-white truncate max-w-[140px]" title={call.campaignName}>{call.campaignName}</td>
                    <td className="px-5 py-3.5 text-slate-900 dark:text-white">{call.clientName}</td>
                    <td className="px-5 py-3.5 text-xs font-mono text-slate-600 dark:text-slate-400">{call.phone}</td>
                    <td className="px-5 py-3.5 text-xs font-mono text-center">{call.duration}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${call.status === 'Concluída'
                        ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-900/30'
                        : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/30'
                        }`}>
                        {call.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-500 dark:text-slate-400 truncate max-w-[150px]" title={call.reason}>{call.reason}</td>
                    <td className="px-5 py-3.5 text-center">
                      {call.success ? (
                        <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                          <span className="text-xs font-bold">✓</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400">
                          <span className="text-xs font-bold">✕</span>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-right text-slate-700 dark:text-slate-300">R$ {call.cost.toFixed(2)}</td>
                    <td className="px-5 py-3.5 text-right last:pr-6">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {call.recordingUrl && (
                          <button
                            className="p-1.5 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-md text-orange-600 dark:text-orange-400 transition-colors btn-click"
                            title="Ouvir Gravação"
                            onClick={() => call.recordingUrl && window.open(call.recordingUrl, '_blank')}
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                          </button>
                        )}
                        <button
                          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-primary transition-colors btn-click"
                          title="Ver Detalhes"
                          onClick={() => handleOpenDetails(call)}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CallDetailsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        call={selectedCall}
      />
    </div>
  );
};