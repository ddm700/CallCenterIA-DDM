import React from 'react';
import { Card, Badge } from '../components/ui';
import { Award, Star, ThumbsUp, AlertCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const NPS_DATA = [
  { name: 'Excelente', value: 6, color: '#F97316' },
  { name: 'Razoável', value: 32, color: '#52525B' },
  { name: 'Ruim', value: 58, color: '#FDF6E3' } // Using light color for 'Ruim' to match screenshot style
];

const CAMPAIGN_QUALITY = [
  { name: 'Campanha - Vonage 1', score: 50 },
  { name: 'simultaneas', score: 45 },
  { name: 'Sem campanha', score: 43 },
  { name: 'Campanha - Vonage 2', score: 40 },
  { name: 'simultaneas - 2', score: 30 },
  { name: 'Campanha Caduceu 2', score: 30 },
];

export const Quality: React.FC = () => {
  return (
    <div className="space-y-6">
       <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-6 flex items-center justify-between">
             <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Net Promoter Score</p>
                <h3 className="text-4xl font-bold text-slate-900 dark:text-white mt-2">-82</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">22 avaliações</p>
             </div>
             <div className="h-10 w-10 bg-slate-400 rounded-lg flex items-center justify-center text-white">
                <Award className="w-6 h-6" />
             </div>
          </Card>

          <Card className="p-6 flex items-center justify-between">
             <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Rating Médio</p>
                <h3 className="text-4xl font-bold text-slate-900 dark:text-white mt-2">2.7</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">De 0 a 10</p>
             </div>
             <div className="h-10 w-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center text-primary">
                <Star className="w-6 h-6" />
             </div>
          </Card>

          <Card className="p-6 flex items-center justify-between">
             <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Promotores</p>
                <h3 className="text-4xl font-bold text-slate-900 dark:text-white mt-2">2</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">9% do total</p>
             </div>
             <div className="h-10 w-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center text-green-600 dark:text-green-400">
                <ThumbsUp className="w-6 h-6" />
             </div>
          </Card>

          <Card className="p-6 flex items-center justify-between">
             <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Detratores</p>
                <h3 className="text-4xl font-bold text-slate-900 dark:text-white mt-2">20</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">91% do total</p>
             </div>
             <div className="h-10 w-10 bg-slate-400 rounded-lg flex items-center justify-center text-white">
                <AlertCircle className="w-6 h-6" />
             </div>
          </Card>
       </div>

       <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6 h-96">
             <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Distribuição de Ratings</h3>
             <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Classificação qualitativa das ligações</p>
             
             <div className="flex h-full">
               <ResponsiveContainer width="60%" height="80%">
                  <PieChart>
                    <Pie
                      data={NPS_DATA}
                      cx="50%"
                      cy="50%"
                      innerRadius={0}
                      outerRadius={100}
                      dataKey="value"
                      stroke="none"
                    >
                      {NPS_DATA.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
               </ResponsiveContainer>
               <div className="flex flex-col justify-center gap-2">
                  <div className="flex items-center gap-2">
                     <div className="w-3 h-3 bg-slate-600 rounded-full"></div>
                     <span className="text-sm text-slate-600 dark:text-slate-300">Razoável: 32%</span>
                  </div>
                  <div className="flex items-center gap-2">
                     <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                     <span className="text-sm text-orange-500 font-medium">Excelente: 6%</span>
                  </div>
                  <div className="flex items-center gap-2">
                     <div className="w-3 h-3 bg-slate-100 rounded-full border dark:border-slate-600"></div>
                     <span className="text-sm text-slate-400">Boa: 3%</span>
                  </div>
                   <div className="flex items-center gap-2">
                     <span className="text-sm text-yellow-100/50">Ruim: 59%</span>
                  </div>
               </div>
             </div>
          </Card>

          <Card className="p-6 h-96">
             <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Score de Qualidade por Campanha</h3>
             <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Média de avaliações por campanha</p>
             <ResponsiveContainer width="100%" height="80%">
                <BarChart data={CAMPAIGN_QUALITY} margin={{top: 20, right: 20, bottom: 60, left: 0}}>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#475569" />
                   <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={80} tick={{fontSize: 10}} stroke="#94a3b8" />
                   <YAxis domain={[0, 100]} stroke="#94a3b8" />
                   <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }} />
                   <Bar dataKey="score" fill="#F97316" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
             </ResponsiveContainer>
          </Card>
       </div>

       <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Top 10 Objeções Mais Comuns</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Emoções e objeções identificadas nas ligações</p>
          
          <div className="space-y-3">
             <div className="flex items-center justify-between bg-slate-400/50 dark:bg-slate-700/50 rounded-lg p-3 text-slate-800 dark:text-slate-200">
                <div className="flex items-center gap-3">
                   <div className="w-6 h-6 rounded-full bg-slate-500/20 dark:bg-slate-500/40 flex items-center justify-center text-xs font-bold">1</div>
                   <span className="text-sm font-medium">O Cliente Demonstrou Pouca Disposição Para Dialogar</span>
                </div>
                <Badge variant="primary">1 ocorrências</Badge>
             </div>
             <div className="flex items-center justify-between bg-slate-400/50 dark:bg-slate-700/50 rounded-lg p-3 text-slate-800 dark:text-slate-200">
                <div className="flex items-center gap-3">
                   <div className="w-6 h-6 rounded-full bg-slate-500/20 dark:bg-slate-500/40 flex items-center justify-center text-xs font-bold">2</div>
                   <span className="text-sm font-medium">Respondendo De Forma Curta E Sem Demonstrar Objeções Claras Ou Interesse Em Negociar No Momento</span>
                </div>
                <Badge variant="primary">1 ocorrências</Badge>
             </div>
          </div>
       </Card>
    </div>
  );
};