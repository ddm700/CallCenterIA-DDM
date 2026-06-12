import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Calendar, Handshake, Loader2, RefreshCw, Search, X } from 'lucide-react';
import { Card, Input, Button } from '../components/ui';
import { supabaseService } from '../services/supabaseService';
import { AcordoKpi } from '../types';

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

export const KpiAcordos: React.FC = () => {
  const [rows, setRows] = useState<AcordoKpi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCampaign, setSelectedCampaign] = useState('Todas as Campanhas');
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

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return rows.filter(row => {
      const campaignMatch = selectedCampaign === 'Todas as Campanhas' || row.campanha_nome === selectedCampaign;
      const dateMatch =
        (!startDate || row.referencia_data >= startDate) &&
        (!endDate || row.referencia_data <= endDate);

      const searchableText = [
        row.campanha_nome,
        row.campanha_instituicao,
        row.campaign_id,
        row.referencia_data
      ].filter(Boolean).join(' ').toLowerCase();

      const textMatch = !term || searchableText.includes(term);

      return campaignMatch && dateMatch && textMatch;
    });
  }, [rows, searchTerm, selectedCampaign, startDate, endDate]);

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
    setStartDate('');
    setEndDate('');
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
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Input
            icon={Search}
            placeholder="Buscar campanha, instituicao ou ID"
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
                  <th className="px-5 py-3 text-right">Discadas</th>
                  <th className="px-5 py-3 text-right">Atendidas</th>
                  <th className="px-5 py-3 text-right">Contatos</th>
                  <th className="px-5 py-3 text-right">Acordos</th>
                  <th className="px-5 py-3 text-right">Formalizados</th>
                  <th className="px-5 py-3 text-right">Valor Recuperado</th>
                  <th className="px-5 py-3 text-right">Taxa Conv.</th>
                  <th className="px-5 py-3 text-right">Taxa Atend.</th>
                  <th className="px-5 py-3 text-right">Engaj.</th>
                  <th className="px-5 py-3 text-right">TMA</th>
                  <th className="px-5 py-3 text-right">CPR</th>
                  <th className="px-5 py-3 text-right">Falha</th>
                  <th className="px-5 py-3 text-right last:pr-6">Custo</th>
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
                    <td className="px-5 py-3.5 text-right font-mono text-xs">{formatNumber(row.chamadas_discadas)}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs">{formatNumber(row.chamadas_atendidas)}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs">{formatNumber(row.contatos_efetivos)}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs font-semibold text-slate-900 dark:text-white">
                      {formatNumber(row.acordos_fechados)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs">
                      {formatNumber(row.acordos_formalizados_count || 0)}
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
                    <td className="px-5 py-3.5 text-right font-mono text-xs last:pr-6">{formatCurrency(row.custo_operacional)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
