import React, { useEffect, useState } from 'react';
import { Card, Badge } from '../components/ui';
import { Award, Star, ThumbsUp, AlertCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { supabaseService } from '../services/supabaseService';

export const Quality: React.FC = () => {
   // State for all quality data
   const [metrics, setMetrics] = useState<any>({
      nps_score: 0,
      avg_rating: 0,
      promoters: 0,
      detractors: 0,
      total_rated: 0,
      promoters_percent: 0,
      detractors_percent: 0
   });
   const [ratingDistribution, setRatingDistribution] = useState<any[]>([]);
   const [campaignQuality, setCampaignQuality] = useState<any[]>([]);
   const [topObjections, setTopObjections] = useState<any[]>([]);
   const [loading, setLoading] = useState(true);

   // Fetch all quality data on mount
   useEffect(() => {
      const fetchQualityData = async () => {
         try {
            setLoading(true);

            // Fetch all data in parallel
            const [metricsData, distribution, campaigns, objections] = await Promise.all([
               supabaseService.getQualityMetrics(),
               supabaseService.getQualityRatingDistribution(),
               supabaseService.getQualityByCampaign(),
               supabaseService.getQualityTopObjections()
            ]);

            setMetrics(metricsData);
            setRatingDistribution(distribution);
            setCampaignQuality(campaigns);
            setTopObjections(objections);
         } catch (error) {
            console.error('Error fetching quality data:', error);
         } finally {
            setLoading(false);
         }
      };

      fetchQualityData();
   }, []);

   if (loading) {
      return (
         <div className="flex items-center justify-center h-96">
            <div className="text-slate-500 dark:text-slate-400">Carregando dados de qualidade...</div>
         </div>
      );
   }

   return (
      <div className="space-y-6">
         <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="p-6 flex items-center justify-between">
               <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Net Promoter Score</p>
                  <h3 className="text-4xl font-bold text-slate-900 dark:text-white mt-2">{metrics.nps_score}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{metrics.total_rated} avaliações</p>
               </div>
               <div className="h-10 w-10 bg-slate-400 rounded-lg flex items-center justify-center text-white">
                  <Award className="w-6 h-6" />
               </div>
            </Card>

            <Card className="p-6 flex items-center justify-between">
               <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Rating Médio</p>
                  <h3 className="text-4xl font-bold text-slate-900 dark:text-white mt-2">{metrics.avg_rating}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">De 0 a 10</p>
               </div>
               <div className="h-10 w-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center text-primary">
                  <Star className="w-6 h-6" />
               </div>
            </Card>

            <Card className="p-6 flex items-center justify-between">
               <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Promotores</p>
                  <h3 className="text-4xl font-bold text-slate-900 dark:text-white mt-2">{metrics.promoters}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{metrics.promoters_percent}% do total</p>
               </div>
               <div className="h-10 w-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center text-green-600 dark:text-green-400">
                  <ThumbsUp className="w-6 h-6" />
               </div>
            </Card>

            <Card className="p-6 flex items-center justify-between">
               <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Detratores</p>
                  <h3 className="text-4xl font-bold text-slate-900 dark:text-white mt-2">{metrics.detractors}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{metrics.detractors_percent}% do total</p>
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
                           data={ratingDistribution}
                           cx="50%"
                           cy="50%"
                           innerRadius={0}
                           outerRadius={100}
                           dataKey="value"
                           stroke="none"
                        >
                           {ratingDistribution.map((entry, index) => (
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
                  <BarChart data={campaignQuality} margin={{ top: 20, right: 20, bottom: 60, left: 0 }}>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#475569" />
                     <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={80} tick={{ fontSize: 10 }} stroke="#94a3b8" />
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
               {topObjections.length > 0 ? (
                  topObjections.map((objection) => (
                     <div key={objection.rank} className="flex items-center justify-between bg-slate-400/50 dark:bg-slate-700/50 rounded-lg p-3 text-slate-800 dark:text-slate-200">
                        <div className="flex items-center gap-3">
                           <div className="w-6 h-6 rounded-full bg-slate-500/20 dark:bg-slate-500/40 flex items-center justify-center text-xs font-bold">
                              {objection.rank}
                           </div>
                           <span className="text-sm font-medium">{objection.objection}</span>
                        </div>
                        <Badge variant="primary">{objection.occurrences} ocorrências</Badge>
                     </div>
                  ))
               ) : (
                  <div className="text-center text-slate-500 dark:text-slate-400 py-8">
                     Nenhuma objeção identificada ainda
                  </div>
               )}
            </div>
         </Card>
      </div>
   );
};