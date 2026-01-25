import React, { useEffect, useState } from 'react';
import { Card } from '../components/ui';
import { Phone, Target, Clock, DollarSign } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';
import { supabaseService } from '../services/supabaseService';

export const Reports: React.FC = () => {
  // State for all report data
  const [kpis, setKpis] = useState<any>({
    total_calls: 0,
    contacted_calls: 0,
    contact_rate_percent: 0,
    successful_calls: 0,
    success_rate_percent: 0,
    avg_duration_seconds: 0,
    total_cost: 0
  });
  const [funnelData, setFunnelData] = useState<any[]>([]);
  const [terminationData, setTerminationData] = useState<any[]>([]);
  const [activityData, setActivityData] = useState<any[]>([]);
  const [costData, setCostData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch all report data on mount
  useEffect(() => {
    const fetchReportData = async () => {
      try {
        setLoading(true);

        // Fetch all data in parallel
        const [kpisData, funnel, termination, activity, costs] = await Promise.all([
          supabaseService.getReportKPIs(),
          supabaseService.getReportFunnel(),
          supabaseService.getReportTerminationReasons(),
          supabaseService.getReportDailyActivity(),
          supabaseService.getReportDailyCosts()
        ]);

        setKpis(kpisData);
        setFunnelData(funnel);
        setTerminationData(termination);
        setActivityData(activity);
        setCostData(costs);
      } catch (error) {
        console.error('Error fetching report data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchReportData();
  }, []);

  // Format duration from seconds to MM:SS
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Format currency
  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-slate-500 dark:text-slate-400">Carregando relatórios...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-6 relative overflow-hidden border-l-4 border-l-orange-500">
          <div className="relative z-10">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Taxa de Contato</p>
            <h3 className="text-4xl font-bold text-slate-900 dark:text-white mt-2">{kpis.contact_rate_percent}%</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{kpis.contacted_calls} de {kpis.total_calls} chamadas</p>
          </div>
          <div className="absolute right-4 top-4 opacity-10">
            <Phone className="w-16 h-16 dark:text-white" />
          </div>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-orange-100 dark:bg-orange-900/40 rounded-lg flex items-center justify-center text-primary">
            <Phone className="w-6 h-6" />
          </div>
        </Card>

        <Card className="p-6 relative overflow-hidden border-l-4 border-l-green-500">
          <div className="relative z-10">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Taxa de Sucesso</p>
            <h3 className="text-4xl font-bold text-slate-900 dark:text-white mt-2">{kpis.success_rate_percent}%</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{kpis.successful_calls} bem-sucedidas</p>
          </div>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-green-100 dark:bg-green-900/40 rounded-lg flex items-center justify-center text-green-600 dark:text-green-400">
            <Target className="w-6 h-6" />
          </div>
        </Card>

        <Card className="p-6 relative overflow-hidden border-l-4 border-l-slate-500">
          <div className="relative z-10">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Duração Média</p>
            <h3 className="text-4xl font-bold text-slate-900 dark:text-white mt-2">{formatDuration(kpis.avg_duration_seconds)}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">minutos por chamada</p>
          </div>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300">
            <Clock className="w-6 h-6" />
          </div>
        </Card>

        <Card className="p-6 relative overflow-hidden border-l-4 border-l-orange-300">
          <div className="relative z-10">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Custo Total</p>
            <h3 className="text-4xl font-bold text-slate-900 dark:text-white mt-2">{formatCurrency(kpis.total_cost)}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{kpis.total_calls} chamadas</p>
          </div>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-orange-50 dark:bg-orange-900/20 rounded-lg flex items-center justify-center text-orange-400">
            <DollarSign className="w-6 h-6" />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funnel Chart */}
        <Card className="p-6 h-96">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">Funil de Conversão</h3>
          <ResponsiveContainer width="100%" height="80%">
            <BarChart data={funnelData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#475569" />
              <XAxis type="number" stroke="#94a3b8" />
              <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }} />
              <Bar dataKey="value" fill="#F97316" radius={[0, 4, 4, 0]} barSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Pie Chart */}
        <Card className="p-6 h-96">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">Motivos de Término</h3>
          <ResponsiveContainer width="100%" height="80%">
            <PieChart>
              <Pie
                data={terminationData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
              >
                {terminationData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }} />
              <Legend verticalAlign="middle" align="right" layout="vertical" formatter={(value) => <span className="text-slate-600 dark:text-slate-300">{value}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        {/* Activity Chart */}
        <Card className="p-6 h-80">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">Atividade por Dia (Últimos 30 Dias)</h3>
          <ResponsiveContainer width="100%" height="80%">
            <LineChart data={activityData}>
              <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="#475569" />
              <XAxis dataKey="day" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }} />
              <Line type="monotone" dataKey="count" stroke="#F97316" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Cost Chart */}
        <Card className="p-6 h-80">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">Evolução de Custos (Últimos 30 Dias)</h3>
          <ResponsiveContainer width="100%" height="80%">
            <LineChart data={costData}>
              <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="#475569" />
              <XAxis dataKey="day" stroke="#94a3b8" />
              <YAxis orientation="right" stroke="#94a3b8" />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }} />
              <Line type="monotone" dataKey="cost" stroke="#22C55E" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
};