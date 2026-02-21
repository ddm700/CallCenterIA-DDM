import React, { useState, useEffect } from 'react';
import { Card, Badge, Input } from '../components/ui';
import { Search, Play, ExternalLink, XCircle, RefreshCw, Loader2, Phone, Activity, UserCheck, Voicemail } from 'lucide-react';
import { Call } from '../types';
import { supabaseService } from '../services/supabaseService';
import { CallDetailsModal } from '../components/CallDetailsModal';

export const Calls: React.FC = () => {
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [selectedCampaign, setSelectedCampaign] = useState('Todas as Campanhas');
  const [selectedClient, setSelectedClient] = useState('Todos os Clientes');
  const [selectedStatus, setSelectedStatus] = useState('Todos os Status');
  const [selectedDate, setSelectedDate] = useState('Todas as Datas');

  // Modal State
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const PAGE_SIZE_OPTIONS = [50, 100, 500, 1000];

  // Filter Data
  const [allCampaignNames, setAllCampaignNames] = useState<string[]>([]);

  const fetchCalls = async () => {
    setLoading(true);
    try {
      const [callsData, campaignsData] = await Promise.all([
        supabaseService.getCalls(),
        supabaseService.getCampaigns()
      ]);
      setCalls(callsData);
      setAllCampaignNames(campaignsData.map(c => c.name));
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalls();
  }, []);

  // --- Filtering Logic ---

  // 1. Extract unique options for dropdowns
  // Combine campaigns from actual calls AND registered campaigns to ensure full list exists in filter
  const uniqueCampaigns = ['Todas as Campanhas', ...Array.from(new Set([
    ...calls.map(c => c.campaignName),
    ...allCampaignNames
  ])).filter(Boolean).sort()];

  const uniqueClients = ['Todos os Clientes', ...Array.from(new Set(calls.map(c => c.clientName))).filter(Boolean).sort()];
  const uniqueStatus = ['Todos os Status', ...Array.from(new Set(calls.map(c => c.status))).filter(Boolean).sort()];

  // Extract Dates (DD/MM/YYYY) from timestamps
  const uniqueDates = ['Todas as Datas', ...Array.from(new Set(calls.map(c => c.date.split(',')[0].trim()))).filter(Boolean).sort((a: string, b: string) => {
    // Sort dates descending (newest first)
    const [da, ma, ya] = a.split('/').map(Number);
    const [db, mb, yb] = b.split('/').map(Number);
    return new Date(yb, mb - 1, db).getTime() - new Date(ya, ma - 1, da).getTime();
  })];

  // 2. Filter data based on selection
  const filteredCalls = calls.filter(call => {
    const matchCampaign = selectedCampaign === 'Todas as Campanhas' || call.campaignName === selectedCampaign;
    const matchClient = selectedClient === 'Todos os Clientes' || call.clientName === selectedClient;
    const matchStatus = selectedStatus === 'Todos os Status' || call.status === selectedStatus;

    // Date matching
    const callDate = call.date.split(',')[0].trim();
    const matchDate = selectedDate === 'Todas as Datas' || callDate === selectedDate;

    return matchCampaign && matchClient && matchStatus && matchDate;
  });

  // 3. Pagination derived values
  const totalPages = Math.max(1, Math.ceil(filteredCalls.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedCalls = filteredCalls.slice((safePage - 1) * pageSize, safePage * pageSize);
  const rangeStart = filteredCalls.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, filteredCalls.length);

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  const handleFilterChange = (setter: React.Dispatch<React.SetStateAction<string>>) =>
    (value: string) => {
      setter(value);
      setCurrentPage(1);
    };

  // --- KPIs Calculation ---
  const kpiTotalToday = calls.filter(c => {
    const today = new Date().toLocaleDateString('pt-BR');
    return c.date.startsWith(today);
  }).length;

  const kpiActive = calls.filter(c => c.status === 'Em andamento').length;

  // Taxa de Alô (Answered Rate): Consideramos atendidas as que foram 'Concluída' e NÃO foram caixa postal
  // Heurística simples para caixa postal baseada no 'reason'
  const isVoicemail = (reason: string) => {
    const r = reason.toLowerCase();
    return r.includes('voicemail') || r.includes('answering') || r.includes('machine') || r.includes('caixa') || r.includes('postal');
  };

  const completedCalls = calls.filter(c => c.status === 'Concluída' || c.status === 'completed');
  const answeredCalls = completedCalls.filter(c => !isVoicemail(c.reason));
  const voicemailCalls = calls.filter(c => isVoicemail(c.reason));

  const kpiAnsweredRate = calls.length > 0 ? Math.round((answeredCalls.length / calls.length) * 100) : 0;
  const kpiVoicemailRate = calls.length > 0 ? Math.round((voicemailCalls.length / calls.length) * 100) : 0;


  const handleOpenDetails = (call: Call) => {
    setSelectedCall(call);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">

      {/* Live Operations Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
        {/* Total Hoje */}
        <Card className="bg-surface dark:bg-dark-surface border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between border-l-4 border-l-primary shadow-sm hover:shadow-md transition-all">
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Chamadas Hoje</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-mono font-bold text-slate-900 dark:text-white">{kpiTotalToday}</span>
              <span className="text-[10px] text-slate-400">vol. diário</span>
            </div>
          </div>
          <div className="p-2.5 bg-orange-50 dark:bg-orange-900/10 rounded-lg">
            <Phone className="w-5 h-5 text-primary" />
          </div>
        </Card>

        {/* Em Curso - Pulsing */}
        <Card className="bg-surface dark:bg-dark-surface border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-all relative overflow-hidden">
          {kpiActive > 0 && <span className="absolute top-0 right-0 w-2 h-2 bg-blue-500 rounded-full animate-ping m-2"></span>}
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
              Em Curso
              {kpiActive > 0 && <span className="flex w-2 h-2 bg-blue-500 rounded-full"></span>}
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-mono font-bold text-slate-900 dark:text-white">{kpiActive}</span>
              <span className="text-[10px] text-slate-400">agora</span>
            </div>
          </div>
          <div className="p-2.5 bg-blue-50 dark:bg-blue-900/10 rounded-lg">
            <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
        </Card>

        {/* Taxa de Alô (Conectividade) */}
        <Card className="bg-surface dark:bg-dark-surface border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between border-l-4 border-l-emerald-500 shadow-sm hover:shadow-md transition-all">
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Taxa de Alô</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-mono font-bold text-slate-900 dark:text-white">{kpiAnsweredRate}%</span>
              <span className="text-[10px] text-emerald-500 font-medium">humano</span>
            </div>
          </div>
          <div className="p-2.5 bg-emerald-50 dark:bg-emerald-900/10 rounded-lg">
            <UserCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
        </Card>

        {/* Taxa de Caixa Postal */}
        <Card className="bg-surface dark:bg-dark-surface border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between border-l-4 border-l-purple-500 shadow-sm hover:shadow-md transition-all">
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Caixa Postal</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-mono font-bold text-slate-900 dark:text-white">{kpiVoicemailRate}%</span>
              <span className="text-[10px] text-slate-400">máquina</span>
            </div>
          </div>
          <div className="p-2.5 bg-purple-50 dark:bg-purple-900/10 rounded-lg">
            <Voicemail className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
        </Card>
      </div>

      {/* Filters - Tech Control Panel */}
      <div className="bg-surface dark:bg-dark-surface p-5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm animate-slide-up">
        <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Search className="w-4 h-4" /> Filtros Avançados
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <select
            value={selectedCampaign}
            onChange={(e) => handleFilterChange(setSelectedCampaign)(e.target.value)}
            className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 focus:ring-1 focus:ring-primary focus:border-primary transition-shadow cursor-pointer"
          >
            {uniqueCampaigns.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select
            value={selectedClient}
            onChange={(e) => handleFilterChange(setSelectedClient)(e.target.value)}
            className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 focus:ring-1 focus:ring-primary focus:border-primary transition-shadow cursor-pointer"
          >
            {uniqueClients.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => handleFilterChange(setSelectedStatus)(e.target.value)}
            className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 focus:ring-1 focus:ring-primary focus:border-primary transition-shadow cursor-pointer"
          >
            {uniqueStatus.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <select
            value={selectedDate}
            onChange={(e) => handleFilterChange(setSelectedDate)(e.target.value)}
            className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 focus:ring-1 focus:ring-primary focus:border-primary transition-shadow cursor-pointer"
          >
            {uniqueDates.map(d => <option key={d} value={d}>{d}</option>)}
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
            {filteredCalls.length} RECS
          </span>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-500 dark:text-slate-400">
            <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
            Carregando dados...
          </div>
        ) : filteredCalls.length === 0 ? (
          <div className="text-center py-12 text-slate-500 dark:text-slate-400">
            {calls.length > 0 ? 'Nenhum resultado para os filtros selecionados.' : 'Nenhuma ligação encontrada.'}
          </div>
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
                {paginatedCalls.map((call) => (
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
                      <div className="flex items-center justify-end gap-1">
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

        {/* Pagination Footer */}
        {!loading && filteredCalls.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Left: range info */}
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
              Exibindo <span className="font-semibold text-slate-700 dark:text-slate-300">{rangeStart}–{rangeEnd}</span> de{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-300">{filteredCalls.length}</span> registros
            </p>

            {/* Center: page size selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">Linhas por página:</span>
              <div className="flex items-center gap-1">
                {PAGE_SIZE_OPTIONS.map(size => (
                  <button
                    key={size}
                    onClick={() => handlePageSizeChange(size)}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${pageSize === size
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Right: prev / page indicator / next */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="px-3 py-1 rounded text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                ← Anterior
              </button>
              <span className="text-xs font-mono text-slate-600 dark:text-slate-400 min-w-[70px] text-center">
                {safePage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="px-3 py-1 rounded text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Próxima →
              </button>
            </div>
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