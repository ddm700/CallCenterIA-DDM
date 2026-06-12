import React, { useState, useEffect } from 'react';
import { Card, Button, Badge, Modal, Input } from '../components/ui';
import { Play, Pause, Trash2, Edit, Plus, Phone, Users, Clock, RefreshCw, Loader2, TrendingUp } from 'lucide-react';
import { Campaign, VapiAssistant, VapiPhoneNumber } from '../types';
import { supabaseService } from '../services/supabaseService';
import { vapiService } from '../services/vapiService';
import { campaignService } from '../services/api';

export const Campaigns: React.FC = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  // Execution State
  const [executingId, setExecutingId] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit Mode State
  const [editingId, setEditingId] = useState<string | null>(null);

  // VAPI Data for Dropdowns
  const [assistants, setAssistants] = useState<VapiAssistant[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<VapiPhoneNumber[]>([]);
  const [loadingVapi, setLoadingVapi] = useState(false);
  const [vapiError, setVapiError] = useState<string | null>(null);

  // Campaign Form State
  const initialFormState = {
    name: '',
    institution: '',
    type: 'VAPI' as 'VAPI' | 'WhatsApp',
    vapiAssistantId: '',
    vapiPhoneId: '',
    maxAttempts: 3,
    intervalMinutes: 60,
    startTime: '09:00',
    endTime: '18:00',
    startActive: true
  };
  const [formData, setFormData] = useState(initialFormState);

  // --- Load Data ---

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const data = await supabaseService.getCampaigns();
      setCampaigns(data);
    } catch (error) {
      console.error(error);
      alert('Erro ao buscar campanhas no banco de dados.');
    } finally {
      setLoading(false);
    }
  };

  const fetchVapiData = async () => {
    setLoadingVapi(true);
    setVapiError(null);
    try {
      const resources = await vapiService.getResources();
      setAssistants(resources.assistants);
      setPhoneNumbers(resources.phoneNumbers);

      if (resources.assistants.length === 0 || resources.phoneNumbers.length === 0) {
        const missingResources: string[] = [];
        if (resources.phoneNumbers.length === 0) missingResources.push('linhas');
        if (resources.assistants.length === 0) missingResources.push('assistentes');

        setVapiError(`Nenhum recurso VAPI encontrado para: ${missingResources.join(' e ')}.`);
      }
    } catch (error: any) {
      console.error(error);
      setAssistants([]);
      setPhoneNumbers([]);
      setVapiError(error?.message || 'Erro ao carregar recursos da VAPI.');
    } finally {
      setLoadingVapi(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  // Fetch VAPI data when modal opens
  useEffect(() => {
    if (isModalOpen) {
      fetchVapiData();
    }
  }, [isModalOpen]);

  // --- Actions ---

  const openCreateModal = () => {
    setEditingId(null);
    setFormData(initialFormState);
    setVapiError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (e: React.MouseEvent, campaign: Campaign) => {
    e.stopPropagation();
    setEditingId(campaign.id);
    setFormData({
      name: campaign.name,
      institution: campaign.institution,
      type: campaign.type,
      vapiAssistantId: campaign.vapi_assistant_id || '',
      vapiPhoneId: campaign.vapi_phone_id || '',
      maxAttempts: campaign.maxAttempts,
      intervalMinutes: campaign.intervalMinutes,
      startTime: campaign.startTime,
      endTime: campaign.endTime,
      startActive: campaign.active
    });
    setVapiError(null);
    setIsModalOpen(true);
  };

  const toggleCampaign = async (e: React.MouseEvent, id: string, currentActive: boolean) => {
    e.stopPropagation();
    // Optimistic update
    setCampaigns(prev => prev.map(c => c.id === id ? { ...c, active: !currentActive, status: !currentActive ? 'active' : 'paused' } : c));

    try {
      await supabaseService.toggleCampaignStatus(id, !currentActive);
    } catch (error) {
      alert('Erro ao atualizar status.');
      fetchCampaigns(); // Revert on error
    }
  };

  const handleExecuteCampaign = async (e: React.MouseEvent, campaign: Campaign) => {

    e.preventDefault();
    e.stopPropagation();

    if (executingId) return; // Prevent double click

    if (!confirm(`Deseja executar a campanha "${campaign.name}" agora?`)) return;


    setExecutingId(campaign.id);
    try {
      await campaignService.startCampaign(campaign.id, campaign.name);
      alert(`Sucesso! O comando foi enviado para o n8n.`);
    } catch (error: any) {
      console.error("Erro na execução:", error);
      alert(`Erro ao executar: ${error.message}\nVerifique os Logs do Sistema para mais detalhes.`);
    } finally {

      setExecutingId(null);
    }
  };

  const handleSaveCampaign = async () => {
    if (!formData.name) return alert('Nome da campanha é obrigatório');
    if (formData.type === 'VAPI' && (!formData.vapiAssistantId || !formData.vapiPhoneId)) {
      return alert('Selecione uma linha e um assistente para campanhas VAPI');
    }

    setSaving(true);
    try {
      const payload = {
        name: formData.name,
        institution: formData.institution,
        type: formData.type,
        active: formData.startActive,
        vapi_assistant_id: formData.vapiAssistantId,
        vapi_phone_id: formData.vapiPhoneId,
        maxAttempts: formData.maxAttempts,
        intervalMinutes: formData.intervalMinutes,
        startTime: formData.startTime,
        endTime: formData.endTime
      };

      if (editingId) {
        // Update existing
        await supabaseService.updateCampaign(editingId, payload);
      } else {
        // Create new
        await supabaseService.createCampaign({
          ...payload,
          status: formData.startActive ? 'active' : 'draft',
        });
      }

      setIsModalOpen(false);
      fetchCampaigns(); // Refresh list

    } catch (error: any) {
      console.error('Erro ao salvar campanha:', error);
      alert(error?.message || 'Erro ao salvar campanha');
    } finally {
      setSaving(false);
    }
  };

  // --- Stats Calculation ---
  const activeCampaignsCount = campaigns.filter(c => c.active).length;
  const totalContacts = campaigns.reduce((acc, curr) => acc + (curr.totalContacts || 0), 0);
  const pendingContacts = campaigns.reduce((acc, curr) => acc + (curr.pendingContacts || 0), 0);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
        <div className="bg-surface dark:bg-dark-surface p-6 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Campanhas Ativas</p>
              <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-1 font-mono tracking-tight">{activeCampaignsCount}</h3>
              <p className="text-xs text-slate-400">em execução</p>
            </div>
            <div className="h-10 w-10 bg-orange-50 dark:bg-orange-900/20 rounded-md border border-orange-100 dark:border-orange-900/30 flex items-center justify-center text-primary">
              <Phone className="w-5 h-5" />
            </div>
          </div>
        </div>
        <div className="bg-surface dark:bg-dark-surface p-6 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total de Contatos</p>
              <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-1 font-mono tracking-tight">{totalContacts}</h3>
              <p className="text-xs text-slate-400">em todas as campanhas</p>
            </div>
            <div className="h-10 w-10 bg-slate-50 dark:bg-slate-800 rounded-md border border-slate-100 dark:border-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400">
              <Users className="w-5 h-5" />
            </div>
          </div>
        </div>
        <div className="bg-surface dark:bg-dark-surface p-6 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Contatos Pendentes</p>
              <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-1 font-mono tracking-tight">{pendingContacts}</h3>
              <p className="text-xs text-slate-400">aguardando discagem</p>
            </div>
            <div className="h-10 w-10 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-100 dark:border-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Clock className="w-5 h-5" />
            </div>
          </div>
        </div>
        <div className="bg-surface dark:bg-dark-surface p-6 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Eficiência Global</p>
              <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-1 font-mono tracking-tight">
                {totalContacts > 0 ? Math.round((campaigns.reduce((acc, curr) => acc + (curr.completedContacts || 0), 0) / totalContacts) * 100) : 0}%
              </h3>
              <p className="text-xs text-slate-400">taxa de conclusão</p>
            </div>
            <div className="h-10 w-10 bg-green-50 dark:bg-green-900/20 rounded-md border border-green-100 dark:border-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Campaign List */}
      <div className="bg-surface dark:bg-dark-surface rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm animate-slide-up">
        <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">Campanhas</h2>
            <button
              onClick={fetchCampaigns}
              className="p-1.5 text-slate-400 hover:text-primary hover:bg-orange-50 dark:hover:bg-orange-900/10 rounded-md transition-all btn-click"
              title="Atualizar lista"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          <Button icon={Plus} onClick={openCreateModal} size="sm" className="btn-click shadow-sm">Nova Campanha</Button>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Sincronizando dados...</p>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400">
            <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <Phone className="w-8 h-8 text-slate-300 dark:text-slate-600" />
            </div>
            <h3 className="text-slate-900 dark:text-white font-medium mb-1">Nenhuma campanha criada</h3>
            <p className="text-sm">Comece criando sua primeira campanha de disparos.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/50 dark:bg-slate-800/50 text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3 first:pl-6">Campanha</th>
                  <th className="px-5 py-3">Instituição</th>
                  <th className="px-5 py-3">Canal</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-center">Volume</th>
                  <th className="px-5 py-3 text-center">Ativar</th>
                  <th className="px-5 py-3 text-right last:pr-6">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {campaigns.map((campaign) => (
                  <tr key={campaign.id} className="group hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-5 py-3.5 first:pl-6 font-medium text-slate-900 dark:text-white">
                      {campaign.name}
                      <div className="text-[10px] font-normal text-slate-400 mt-0.5 font-mono">{campaign.startTime} - {campaign.endTime}</div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300">{campaign.institution || '-'}</td>
                    <td className="px-5 py-3.5">
                      <div className="inline-flex items-center px-2 py-1 rounded border text-[10px] font-medium bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">
                        {campaign.type}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border ${campaign.status === 'active'
                        ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-900/30'
                        : campaign.status === 'completed'
                          ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-900/30'
                          : campaign.status === 'draft'
                            ? 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                            : 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-900/30'
                        }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${campaign.status === 'active' ? 'bg-green-500 animate-pulse' :
                          campaign.status === 'completed' ? 'bg-blue-500' :
                            campaign.status === 'draft' ? 'bg-slate-400' : 'bg-yellow-500'
                          }`}></span>
                        {campaign.status === 'active' ? 'Executando' : campaign.status === 'completed' ? 'Concluído' : campaign.status === 'draft' ? 'Rascunho' : 'Pausado'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center font-mono text-slate-600 dark:text-slate-400">{campaign.totalContacts || 0}</td>
                    <td className="px-5 py-3.5 text-center">
                      <div
                        onClick={(e) => toggleCampaign(e, campaign.id, campaign.active)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full cursor-pointer transition-colors shadow-inner ${campaign.active ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-700'}`}
                        title={campaign.active ? "Desativar campanha" : "Ativar campanha"}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${campaign.active ? 'translate-x-4.5' : 'translate-x-1'}`} />
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right last:pr-6">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={(e) => handleExecuteCampaign(e, campaign)}
                          disabled={executingId === campaign.id}
                          className={`p-1.5 rounded-md transition-colors btn-click ${executingId === campaign.id ? 'text-slate-400 cursor-not-allowed' : 'hover:bg-green-50 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400 border border-transparent hover:border-green-200 dark:hover:border-green-900/50'}`}
                          title="Forçar Execução Agora"
                        >
                          {executingId === campaign.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => openEditModal(e, campaign)}
                          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors btn-click"
                          title="Configurações"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md text-slate-400 hover:text-red-500 transition-colors btn-click"
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? "Editar Campanha" : "Criar Nova Campanha"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveCampaign} disabled={saving || loadingVapi}>
              {saving ? 'Salvando...' : editingId ? 'Salvar Alterações' : 'Criar Campanha'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Nome da Campanha"
            placeholder="Ex: Campanha de Cobrança Q1"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
          <Input
            label="Instituição"
            placeholder="Ex: Banco XYZ"
            value={formData.institution}
            onChange={(e) => setFormData({ ...formData, institution: e.target.value })}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tipo de Telefonia</label>
              <select
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
              >
                <option value="VAPI">VAPI (Ligação Telefônica)</option>
                <option value="WhatsApp">WhatsApp</option>
              </select>
            </div>

            {formData.type === 'VAPI' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Linha VAPI</label>
                <select
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                  value={formData.vapiPhoneId}
                  onChange={(e) => setFormData({ ...formData, vapiPhoneId: e.target.value })}
                  disabled={loadingVapi}
                >
                  <option value="">
                    {loadingVapi
                      ? 'Carregando...'
                      : phoneNumbers.length === 0
                        ? 'Nenhuma linha encontrada'
                        : 'Selecione uma linha...'}
                  </option>
                  {phoneNumbers.map(phone => (
                    <option key={phone.id} value={phone.id}>
                      {phone.number} {phone.name ? `(${phone.name})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {formData.type === 'VAPI' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Assistente VAPI</label>
              <select
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                value={formData.vapiAssistantId}
                onChange={(e) => setFormData({ ...formData, vapiAssistantId: e.target.value })}
                disabled={loadingVapi}
              >
                <option value="">
                  {loadingVapi
                    ? 'Carregando...'
                    : assistants.length === 0
                      ? 'Nenhum assistente encontrado'
                      : 'Selecione um assistente...'}
                </option>
                {assistants.map(assistant => (
                  <option key={assistant.id} value={assistant.id}>
                    {assistant.name || assistant.model?.model || 'Assistente sem nome'} ({assistant.id.slice(0, 5)}...)
                  </option>
                ))}
              </select>
              {vapiError && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  {vapiError} Verifique a chave VAPI em Configurações e se a API `/api/vapi/resources` está respondendo.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input
              type="number"
              label="Máx. Tentativas"
              value={formData.maxAttempts}
              onChange={(e) => setFormData({ ...formData, maxAttempts: parseInt(e.target.value) })}
            />
            <Input
              type="number"
              label="Intervalo (min)"
              value={formData.intervalMinutes}
              onChange={(e) => setFormData({ ...formData, intervalMinutes: parseInt(e.target.value) })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              type="time"
              label="Horário Início"
              value={formData.startTime}
              onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
            />
            <Input
              type="time"
              label="Horário Fim"
              value={formData.endTime}
              onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
            />
          </div>

          <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600">
            <input
              type="checkbox"
              id="activeInit"
              className="rounded text-primary focus:ring-primary"
              checked={formData.startActive}
              onChange={(e) => setFormData({ ...formData, startActive: e.target.checked })}
            />
            <label htmlFor="activeInit" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
              <strong>{editingId ? 'Campanha Ativa' : 'Iniciar Ativa'}</strong>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {editingId ? 'Pausar ou ativar esta campanha' : 'A campanha começará imediatamente após criação'}
              </p>
            </label>
          </div>
        </div>
      </Modal>
    </div>
  );
};
