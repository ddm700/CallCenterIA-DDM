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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-fade-in">
        <div className="bg-surface dark:bg-dark-surface p-6 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="relative z-10">
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Taxa de Contato</p>
            <h3 className="text-4xl font-bold text-slate-900 dark:text-white mt-1 font-mono tracking-tight">{kpis.contact_rate_percent}%</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{kpis.contacted_calls} de {kpis.total_calls} chamadas</p>
          </div>
          <div className="absolute right-0 top-0 h-full w-1 bg-orange-500"></div>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-orange-50 dark:bg-orange-900/20 rounded-md flex items-center justify-center text-primary">
            <Phone className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-surface dark:bg-dark-surface p-6 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="relative z-10">
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Taxa de Sucesso</p>
            <h3 className="text-4xl font-bold text-slate-900 dark:text-white mt-1 font-mono tracking-tight">{kpis.success_rate_percent}%</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{kpis.successful_calls} bem-sucedidas</p>
          </div>
          <div className="absolute right-0 top-0 h-full w-1 bg-green-500"></div>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-green-50 dark:bg-green-900/20 rounded-md flex items-center justify-center text-green-600 dark:text-green-400">
            <Target className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-surface dark:bg-dark-surface p-6 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="relative z-10">
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Duração Média</p>
            <h3 className="text-4xl font-bold text-slate-900 dark:text-white mt-1 font-mono tracking-tight">{formatDuration(kpis.avg_duration_seconds)}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">minutos por chamada</p>
          </div>
          <div className="absolute right-0 top-0 h-full w-1 bg-slate-400"></div>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-slate-50 dark:bg-slate-800 rounded-md flex items-center justify-center text-slate-600 dark:text-slate-300">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-surface dark:bg-dark-surface p-6 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="relative z-10">
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Custo Total</p>
            <h3 className="text-4xl font-bold text-slate-900 dark:text-white mt-1 font-mono tracking-tight">{formatCurrency(kpis.total_cost)}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{kpis.total_calls} chamadas</p>
          </div>
          <div className="absolute right-0 top-0 h-full w-1 bg-orange-300"></div>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-orange-50 dark:bg-orange-900/10 rounded-md flex items-center justify-center text-orange-400">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-slide-up">
        {/* Funnel Chart */}
        <div className="bg-surface dark:bg-dark-surface p-6 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm h-96">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-6 uppercase tracking-wider flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
            Funil de Conversão
          </h3>
          <ResponsiveContainer width="100%" height="80%">
            <BarChart data={funnelData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#334155" opacity={0.3} />
              <XAxis type="number" stroke="#64748B" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11, fill: '#94A3B8' }} stroke="none" />
              <Tooltip
                contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', color: '#F8FAFC', borderRadius: '4px', fontSize: '12px' }}
                cursor={{ fill: '#334155', opacity: 0.2 }}
              />
              <Bar dataKey="value" fill="#F97316" radius={[0, 4, 4, 0]} barSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie Chart */}
        <div className="bg-surface dark:bg-dark-surface p-6 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm h-96">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-6 uppercase tracking-wider flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
            Motivos de Término
          </h3>
          <ResponsiveContainer width="100%" height="80%">
            <PieChart>
              <Pie
                data={terminationData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={4}
                dataKey="value"
                stroke="none"
              >
                {terminationData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', color: '#F8FAFC', borderRadius: '4px', fontSize: '12px' }} />
              <Legend verticalAlign="middle" align="right" layout="vertical" iconType="circle" formatter={(value) => <span className="text-slate-600 dark:text-slate-400 text-xs font-medium ml-1">{value}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Activity Chart */}
        <div className="bg-surface dark:bg-dark-surface p-6 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm h-80">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-6 uppercase tracking-wider flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div>
            Atividade Diária
          </h3>
          <ResponsiveContainer width="100%" height="80%">
            <LineChart data={activityData}>
              <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="#334155" opacity={0.3} />
              <XAxis dataKey="day" stroke="#64748B" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#64748B" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', color: '#F8FAFC', borderRadius: '4px', fontSize: '12px' }} />
              <Line type="monotone" dataKey="count" stroke="#F97316" strokeWidth={2} dot={{ r: 4, strokeWidth: 0, fill: '#F97316' }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Cost Chart */}
        <div className="bg-surface dark:bg-dark-surface p-6 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm h-80">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-6 uppercase tracking-wider flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
            Evolução de Custos
          </h3>
          <ResponsiveContainer width="100%" height="80%">
            <LineChart data={costData}>
              <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="#334155" opacity={0.3} />
              <XAxis dataKey="day" stroke="#64748B" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis orientation="right" stroke="#64748B" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', color: '#F8FAFC', borderRadius: '4px', fontSize: '12px' }} />
              <Line type="monotone" dataKey="cost" stroke="#22C55E" strokeWidth={2} dot={{ r: 4, strokeWidth: 0, fill: '#22C55E' }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};