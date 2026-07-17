import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { BarChart3, Calendar, Download, ExternalLink, FileText, Handshake, Loader2, MessageSquare, Play, RefreshCw, Search, UserCheck, Volume2, X } from 'lucide-react';
import { Badge, Card, Input, Button, Modal } from '../components/ui';
import { supabaseService } from '../services/supabaseService';
import { AcordoCallDetail, AcordoKpi } from '../types';

const formatDate = (value?: string) => {
  if (!value) return '-';
  const [year, month, day] = value.slice(0, 10).split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value || 0);

const formatNumber = (value: number, decimals = 0) =>
  new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value || 0);

const formatDuration = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.round(seconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
};

const formatDateTime = (value?: string) => {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
};

const ALL_AGENTS = 'Todos os Agentes';

const getCallAgent = (call?: AcordoCallDetail) =>
  call?.agente_responsavel || call?.assistant_id || 'Sem agente';

const getRowAgents = (row: AcordoKpi) => {
  const agents = row.agentes_responsaveis && row.agentes_responsaveis.length > 0
    ? row.agentes_responsaveis
    : (row.acordo_calls || []).map(getCallAgent);

  return Array.from(new Set(agents.filter(Boolean))).sort((a, b) => a.localeCompare(b));
};

const formatAgents = (row: AcordoKpi) => {
  const agents = getRowAgents(row);
  return agents.length > 0 ? agents.join(', ') : '-';
};

export const KpiAcordos: React.FC = () => {
  const [rows, setRows] = useState<AcordoKpi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedAgreementRow, setSelectedAgreementRow] = useState<AcordoKpi | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCampaign, setSelectedCampaign] = useState('Todas as Campanhas');
  const [selectedAgent, setSelectedAgent] = useState(ALL_AGENTS);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchData = async () => {
    setLoading(true);
    setError('');

    try {
      const data = await supabaseService.getAcordosKPIs();
      setRows(data);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Nao foi possivel carregar os KPIs de acordos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const campaignOptions = useMemo(() => {
    const names = rows
      .map(row => row.campanha_nome)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    return ['Todas as Campanhas', ...Array.from(new Set(names))];
  }, [rows]);

  const agentOptions = useMemo(() => {
    const agents = rows
      .flatMap(getRowAgents)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    return [ALL_AGENTS, ...Array.from(new Set(agents))];
  }, [rows]);

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return rows.filter(row => {
      const campaignMatch = selectedCampaign === 'Todas as Campanhas' || row.campanha_nome === selectedCampaign;
      const rowAgents = getRowAgents(row);
      const agentMatch = selectedAgent === ALL_AGENTS || rowAgents.includes(selectedAgent);
      const dateMatch =
        (!startDate || row.referencia_data >= startDate) &&
        (!endDate || row.referencia_data <= endDate);

      const searchableText = [
        row.campanha_nome,
        row.campanha_instituicao,
        ...rowAgents,
        row.campaign_id,
        row.referencia_data
      ].filter(Boolean).join(' ').toLowerCase();

      const textMatch = !term || searchableText.includes(term);

      return campaignMatch && agentMatch && dateMatch && textMatch;
    });
  }, [rows, searchTerm, selectedCampaign, selectedAgent, startDate, endDate]);

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => ({
        acordos: acc.acordos + row.acordos_fechados,
        formalizados: acc.formalizados + (row.acordos_formalizados_count || 0),
        valorRecuperado: acc.valorRecuperado + row.valor_recuperado,
        custoOperacional: acc.custoOperacional + row.custo_operacional,
        chamadas: acc.chamadas + row.chamadas_totais
      }),
      {
        acordos: 0,
        formalizados: 0,
        valorRecuperado: 0,
        custoOperacional: 0,
        chamadas: 0
      }
    );
  }, [filteredRows]);

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedCampaign('Todas as Campanhas');
    setSelectedAgent(ALL_AGENTS);
    setStartDate('');
    setEndDate('');
  };

  const handleExport = () => {
    const sheetData = filteredRows.map(row => ({
      'Data': formatDate(row.referencia_data),
      'Campanha': row.campanha_nome || '-',
      'Instituicao': row.campanha_instituicao || '-',
      'Agentes Responsaveis': formatAgents(row),
      'Discadas': row.chamadas_discadas,
      'Atendidas': row.chamadas_atendidas,
      'Contatos Efetivos': row.contatos_efetivos,
      'Acordos Fechados': row.acordos_fechados,
      'Acordos Formalizados': row.acordos_formalizados_count || 0,
      'Gravacoes': row.acordo_calls?.length || 0,
      'Valor Recuperado (R$)': Number((row.valor_recuperado || 0).toFixed(2)),
      'Custo Operacional (R$)': Number((row.custo_operacional || 0).toFixed(2)),
      'Taxa Conversao (%)': Number(row.taxa_conversao?.toFixed(2) || 0),
      'Taxa Atendimento (%)': Number(row.taxa_atendimento?.toFixed(2) || 0),
      'Taxa Engajamento (%)': Number(row.taxa_engajamento?.toFixed(2) || 0),
      'TMA': formatDuration(row.tma_segundos),
      'CPR': Number(row.cpr?.toFixed(4) || 0),
      'Taxa de Falha (%)': Number(row.call_failure_rate?.toFixed(2) || 0)
    }));

    const agreementData = filteredRows.flatMap(row =>
      (row.acordo_calls || []).map((call, index) => ({
        'Data': formatDate(row.referencia_data),
        'Campanha': row.campanha_nome || '-',
        'Instituicao': row.campanha_instituicao || '-',
        'Agente Responsavel': getCallAgent(call),
        'Cliente': call.nome || '-',
        'CPF': call.cpf || '-',
        'Telefone': call.telefone || '-',
        'VAPI Call ID': call.vapi_call_id || '-',
        'Inicio': formatDateTime(call.started_at),
        'Duracao': formatDuration(call.duration_seconds || 0),
        'Status': call.status || '-',
        'Motivo': call.ended_reason || '-',
        'Audio': call.recording_url ? 'Disponivel' : 'Indisponivel',
        'Custo (R$)': Number((call.custo_total || 0).toFixed(2)),
        'Resumo': call.summary || '-',
        'Transcricao': call.transcript || '-',
        'Ordem': index + 1
      }))
    );

    const worksheet = XLSX.utils.json_to_sheet(sheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'KPIs Acordos');
    if (agreementData.length > 0) {
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(agreementData), 'Acordos');
    }

    const today = new Date();
    const stamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    XLSX.writeFile(workbook, `relatorio-acordos-${stamp}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-fade-in">
        <Card className="p-4 border-l-4 border-l-primary">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Acordos</p>
              <p className="mt-1 text-2xl font-mono font-bold text-slate-900 dark:text-white">{formatNumber(totals.acordos)}</p>
            </div>
            <div className="p-2.5 bg-orange-50 dark:bg-orange-900/10 rounded-lg text-primary">
              <Handshake className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-emerald-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Formalizados</p>
              <p className="mt-1 text-2xl font-mono font-bold text-slate-900 dark:text-white">{formatNumber(totals.formalizados)}</p>
            </div>
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-900/10 rounded-lg text-emerald-600 dark:text-emerald-400">
              <BarChart3 className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-blue-500">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Valor Recuperado</p>
          <p className="mt-1 text-2xl font-mono font-bold text-slate-900 dark:text-white">{formatCurrency(totals.valorRecuperado)}</p>
        </Card>

        <Card className="p-4 border-l-4 border-l-slate-400">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Custo Operacional</p>
          <p className="mt-1 text-2xl font-mono font-bold text-slate-900 dark:text-white">{formatCurrency(totals.custoOperacional)}</p>
        </Card>
      </div>

      <Card className="p-5 animate-slide-up">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Search className="w-4 h-4" /> Filtros
          </h2>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" icon={X} onClick={clearFilters}>
              Limpar
            </Button>
            <Button variant="outline" size="sm" icon={RefreshCw} onClick={fetchData} disabled={loading}>
              Atualizar
            </Button>
            <Button variant="primary" size="sm" icon={Download} onClick={handleExport} disabled={loading || filteredRows.length === 0}>
              Exportar Relatorio
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Input
            icon={Search}
            placeholder="Buscar campanha, agente ou ID"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />

          <select
            value={selectedCampaign}
            onChange={(event) => setSelectedCampaign(event.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          >
            {campaignOptions.map(campaign => (
              <option key={campaign} value={campaign}>{campaign}</option>
            ))}
          </select>

          <select
            value={selectedAgent}
            onChange={(event) => setSelectedAgent(event.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          >
            {agentOptions.map(agent => (
              <option key={agent} value={agent}>{agent}</option>
            ))}
          </select>

          <Input
            icon={Calendar}
            label="Inicio do periodo"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />

          <Input
            icon={Calendar}
            label="Fim do periodo"
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </div>
      </Card>

      <Card className="overflow-hidden animate-slide-up">
        <div className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">KPIs de Acordos</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Dados agregados de acordos e conferidos com acordos_formalizados.
            </p>
          </div>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono w-fit">
            {filteredRows.length} RECS
          </span>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-500 dark:text-slate-400">
            <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
            Carregando dados...
          </div>
        ) : error ? (
          <div className="text-center py-12 text-red-600 dark:text-red-400">{error}</div>
        ) : filteredRows.length === 0 ? (
          <div className="text-center py-12 text-slate-500 dark:text-slate-400">
            {rows.length > 0 ? 'Nenhum resultado para os filtros selecionados.' : 'Nenhum KPI de acordo encontrado.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/50 dark:bg-slate-800/50 text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3 first:pl-6">Data</th>
                  <th className="px-5 py-3">Campanha</th>
                  <th className="px-5 py-3">Instituicao</th>
                  <th className="px-5 py-3">Agente</th>
                  <th className="px-5 py-3 text-right">Discadas</th>
                  <th className="px-5 py-3 text-right">Atendidas</th>
                  <th className="px-5 py-3 text-right">Contatos</th>
                  <th className="px-5 py-3 text-right">Acordos</th>
                  <th className="px-5 py-3 text-right">Formalizados</th>
                  <th className="px-5 py-3 text-right">Gravacoes</th>
                  <th className="px-5 py-3 text-right">Valor Recuperado</th>
                  <th className="px-5 py-3 text-right">Taxa Conv.</th>
                  <th className="px-5 py-3 text-right">Taxa Atend.</th>
                  <th className="px-5 py-3 text-right">Engaj.</th>
                  <th className="px-5 py-3 text-right">TMA</th>
                  <th className="px-5 py-3 text-right">CPR</th>
                  <th className="px-5 py-3 text-right">Falha</th>
                  <th className="px-5 py-3 text-right">Custo</th>
                  <th className="px-5 py-3 text-right last:pr-6">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredRows.map(row => (
                  <tr key={row.id} className="group hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-5 py-3.5 first:pl-6 font-mono text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {formatDate(row.referencia_data)}
                    </td>
                    <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-white min-w-[180px]" title={row.campanha_nome}>
                      {row.campanha_nome || '-'}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400 min-w-[150px]">
                      {row.campanha_instituicao || '-'}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400 min-w-[160px]" title={formatAgents(row)}>
                      <div className="flex items-center gap-1.5">
                        <UserCheck className="h-3.5 w-3.5 text-slate-400" />
                        <span className="max-w-[180px] truncate">{formatAgents(row)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs">{formatNumber(row.chamadas_discadas)}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs">{formatNumber(row.chamadas_atendidas)}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs">{formatNumber(row.contatos_efetivos)}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs font-semibold text-slate-900 dark:text-white">
                      {formatNumber(row.acordos_fechados)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs">
                      {formatNumber(row.acordos_formalizados_count || 0)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs">
                      {formatNumber(row.acordo_calls?.length || 0)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(row.valor_recuperado)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs">{formatNumber(row.taxa_conversao, 2)}%</td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs">{formatNumber(row.taxa_atendimento, 2)}%</td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs">{formatNumber(row.taxa_engajamento, 2)}%</td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs">{formatDuration(row.tma_segundos)}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs">{formatNumber(row.cpr, 4)}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs">{formatNumber(row.call_failure_rate, 2)}%</td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs">{formatCurrency(row.custo_operacional)}</td>
                    <td className="px-5 py-3.5 text-right last:pr-6">
                      <div className="flex items-center justify-end gap-1">
                        {row.acordo_calls?.some(call => call.recording_url) && (
                          <button
                            className="p-1.5 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-md text-orange-600 dark:text-orange-400 transition-colors btn-click"
                            title="Ouvir gravacao"
                            onClick={() => {
                              const recordingUrl = row.acordo_calls?.find(call => call.recording_url)?.recording_url;
                              if (recordingUrl) window.open(recordingUrl, '_blank');
                            }}
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                          </button>
                        )}
                        {row.acordo_calls && row.acordo_calls.length > 0 ? (
                          <button
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-primary transition-colors btn-click"
                            title={`Ver detalhes das ligacoes dos acordos (${row.acordo_calls.length})`}
                            onClick={() => setSelectedAgreementRow(row)}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        isOpen={Boolean(selectedAgreementRow)}
        onClose={() => setSelectedAgreementRow(null)}
        title="Detalhes das ligacoes dos acordos"
        maxWidth="max-w-6xl"
      >
        {selectedAgreementRow && (
          <div className="space-y-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Campanha</p>
                  <p className="font-medium text-slate-900 dark:text-white">{selectedAgreementRow.campanha_nome || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Data</p>
                  <p className="font-medium text-slate-900 dark:text-white">{formatDate(selectedAgreementRow.referencia_data)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Acordos</p>
                  <p className="font-medium text-slate-900 dark:text-white">{formatNumber(selectedAgreementRow.acordos_formalizados_count || 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Gravacoes encontradas</p>
                  <p className="font-medium text-slate-900 dark:text-white">{formatNumber(selectedAgreementRow.acordo_calls?.length || 0)}</p>
                </div>
              </div>
              <div className="mt-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">Agentes responsaveis</p>
                <p className="font-medium text-slate-900 dark:text-white">{formatAgents(selectedAgreementRow)}</p>
              </div>
            </div>

            <div className="space-y-4">
              {(selectedAgreementRow.acordo_calls || []).map((call: AcordoCallDetail, index) => (
                <div
                  key={`${call.acordo_id}-${call.call_id || index}`}
                  className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
                >
                  <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-base font-semibold text-slate-900 dark:text-white">
                          {call.nome || 'Cliente sem nome'}
                        </h4>
                        <Badge variant={call.status === 'completed' ? 'success' : 'neutral'}>
                          {call.status || 'sem status'}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        CPF {call.cpf || '-'} | VAPI {call.vapi_call_id || '-'}
                      </p>
                    </div>
                    {call.recording_url && (
                      <button
                        className="inline-flex w-fit items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-orange-600 transition-colors hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-900/20 btn-click"
                        title="Ouvir gravacao"
                        onClick={() => call.recording_url && window.open(call.recording_url, '_blank')}
                      >
                        <Play className="h-3.5 w-3.5 fill-current" />
                        Audio
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Agente</p>
                      <p className="text-xs text-slate-900 dark:text-white">{getCallAgent(call)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Inicio</p>
                      <p className="font-mono text-xs text-slate-900 dark:text-white">{formatDateTime(call.started_at)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Duracao</p>
                      <p className="font-mono text-xs text-slate-900 dark:text-white">{formatDuration(call.duration_seconds || 0)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Motivo</p>
                      <p className="text-xs text-slate-900 dark:text-white">{call.ended_reason || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Custo</p>
                      <p className="font-mono text-xs text-slate-900 dark:text-white">{formatCurrency(call.custo_total || 0)}</p>
                    </div>
                  </div>

                  {call.recording_url && (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                      <h5 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        <Volume2 className="h-3.5 w-3.5" /> Gravacao de Audio
                      </h5>
                      <div className="rounded-lg bg-slate-100 p-3 dark:bg-slate-900">
                        <audio controls className="h-10 w-full">
                          <source src={call.recording_url} type="audio/wav" />
                          <source src={call.recording_url} type="audio/mp3" />
                          Seu navegador nao suporta o elemento de audio.
                        </audio>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                      <h5 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        <FileText className="h-3.5 w-3.5" /> Resumo
                      </h5>
                      <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                        {call.summary || 'Resumo indisponivel.'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                      <h5 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        <MessageSquare className="h-3.5 w-3.5" /> Transcricao
                      </h5>
                      <div className="max-h-44 overflow-y-auto whitespace-pre-wrap rounded bg-slate-50 p-3 font-mono text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                        {call.transcript || 'Transcricao indisponivel.'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
