import React, { useState, useEffect } from 'react';
import { Card, Badge, Input } from '../components/ui';
import { Search, Play, ExternalLink, XCircle, RefreshCw } from 'lucide-react';
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
      <Card className="p-6">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">Filtros</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <select className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
                <option>Todas as Campanhas</option>
            </select>
            <select className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
                <option>Todos os Clientes</option>
            </select>
            <select className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
                <option>Todos os Status</option>
            </select>
            <select className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
                <option>Todas as Datas</option>
            </select>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
             <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Histórico de Ligações</h2>
             <button onClick={fetchCalls} className="p-1 text-slate-400 hover:text-primary"><RefreshCw className="w-4 h-4"/></button>
          </div>
          <span className="text-sm text-slate-500 dark:text-slate-400">{calls.length} registros (recentes)</span>
        </div>

        {loading ? (
             <div className="text-center py-8 text-slate-500 dark:text-slate-400">Carregando histórico de ligações...</div>
        ) : calls.length === 0 ? (
             <div className="text-center py-8 text-slate-500 dark:text-slate-400">Nenhuma ligação encontrada.</div>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-700 text-xs uppercase font-semibold text-slate-500 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3 rounded-tl-lg">Data/Hora</th>
                <th className="px-4 py-3">Campanha</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Telefone</th>
                <th className="px-4 py-3">Duração</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Motivo</th>
                <th className="px-4 py-3">Sucesso</th>
                <th className="px-4 py-3">Custo</th>
                <th className="px-4 py-3 rounded-tr-lg text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {calls.map((call) => (
                <tr key={call.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <td className="px-4 py-3 font-mono text-xs">{call.date}</td>
                  <td className="px-4 py-3 truncate max-w-[120px]" title={call.campaignName}>{call.campaignName}</td>
                  <td className="px-4 py-3">{call.clientName}</td>
                  <td className="px-4 py-3 text-xs">{call.phone}</td>
                  <td className="px-4 py-3 text-xs font-mono">{call.duration}</td>
                  <td className="px-4 py-3">
                    <Badge variant={call.status === 'Concluída' ? 'success' : 'danger'}>{call.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs truncate max-w-[150px]" title={call.reason}>{call.reason}</td>
                  <td className="px-4 py-3">
                    {call.success ? (
                        <span className="inline-flex items-center px-2 py-1 rounded bg-green-600 text-white text-xs font-bold">Sim</span>
                    ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded bg-slate-600 text-white text-xs font-bold"><XCircle className="w-3 h-3 mr-1"/> Não</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium">R$ {call.cost.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {call.recordingUrl && (
                        <button 
                          className="p-1 hover:bg-orange-100 dark:hover:bg-orange-900/40 rounded text-orange-500 transition-colors" 
                          title="Ouvir Gravação" 
                          onClick={() => call.recordingUrl && window.open(call.recordingUrl, '_blank')}
                        >
                          <Play className="w-4 h-4 fill-current" />
                        </button>
                      )}
                      <button 
                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded text-slate-500 dark:text-slate-400" 
                        title="Ver Detalhes"
                        onClick={() => handleOpenDetails(call)}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </Card>

      <CallDetailsModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        call={selectedCall} 
      />
    </div>
  );
};