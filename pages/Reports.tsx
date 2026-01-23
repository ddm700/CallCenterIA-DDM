import React from 'react';
import { Card } from '../components/ui';
import { Phone, Target, Clock, DollarSign } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';

// Mock Data for Charts
const FUNNEL_DATA = [
  { name: 'Total', value: 490 },
  { name: 'Conectadas', value: 77 }, // ~15.7%
  { name: 'Bem-Sucedidas', value: 8 }, // ~10.4% of connected
  { name: 'Com Promessa', value: 2 }
];

const TERMINATION_DATA = [
  { name: 'Cliente Desligou', value: 75, color: '#F97316' }, // Orange
  { name: 'Timed Out', value: 17, color: '#FCD34D' }, // Yellow
  { name: 'Assistente Finalizou', value: 1, color: '#64748B' }, // Slate
  { name: 'Erro Transp.', value: 7, color: '#94A3B8' } 
];

const COST_DATA = [
  { day: '01', cost: 0.7 }, { day: '05', cost: 2.1 }, { day: '10', cost: 0.5 },
  { day: '15', cost: 1.8 }, { day: '20', cost: 0.3 }, { day: '25', cost: 2.3 }, { day: '30', cost: 0.4 }
];

export const Reports: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-6 relative overflow-hidden border-l-4 border-l-orange-500">
           <div className="relative z-10">
             <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Taxa de Contato</p>
             <h3 className="text-4xl font-bold text-slate-900 dark:text-white mt-2">15.7%</h3>
             <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">77 de 490 chamadas</p>
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
             <h3 className="text-4xl font-bold text-slate-900 dark:text-white mt-2">10.4%</h3>
             <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">8 bem-sucedidas</p>
           </div>
           <div className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-green-100 dark:bg-green-900/40 rounded-lg flex items-center justify-center text-green-600 dark:text-green-400">
              <Target className="w-6 h-6" />
           </div>
        </Card>

        <Card className="p-6 relative overflow-hidden border-l-4 border-l-slate-500">
           <div className="relative z-10">
             <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Duração Média</p>
             <h3 className="text-4xl font-bold text-slate-900 dark:text-white mt-2">0:58</h3>
             <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">minutos por chamada</p>
           </div>
           <div className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300">
              <Clock className="w-6 h-6" />
           </div>
        </Card>

        <Card className="p-6 relative overflow-hidden border-l-4 border-l-orange-300">
           <div className="relative z-10">
             <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Custo Total</p>
             <h3 className="text-4xl font-bold text-slate-900 dark:text-white mt-2">R$ 37,51</h3>
             <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">490 chamadas</p>
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
            <BarChart data={FUNNEL_DATA} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#475569" />
              <XAxis type="number" stroke="#94a3b8" />
              <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 12}} stroke="#94a3b8" />
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
                data={TERMINATION_DATA}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
              >
                {TERMINATION_DATA.map((entry, index) => (
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
              <LineChart data={COST_DATA}>
                 <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="#475569" />
                 <XAxis dataKey="day" stroke="#94a3b8" />
                 <YAxis stroke="#94a3b8" />
                 <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }} />
                 <Line type="monotone" dataKey="cost" stroke="#F97316" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
           </ResponsiveContainer>
        </Card>

        {/* Cost Chart */}
        <Card className="p-6 h-80">
           <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">Evolução de Custos (Últimos 30 Dias)</h3>
           <ResponsiveContainer width="100%" height="80%">
              <LineChart data={COST_DATA}>
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