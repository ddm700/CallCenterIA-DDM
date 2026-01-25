import React, { useState, useEffect } from 'react';
import { Card, Button, Badge, Modal, Input } from '../components/ui';
import { Play, Pause, Trash2, Edit, Plus, Phone, Users, Clock, RefreshCw, Loader2 } from 'lucide-react';
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
    try {
      const [assists, phones] = await Promise.all([
        vapiService.getAssistants(),
        vapiService.getPhoneNumbers()
      ]);
      setAssistants(assists);
      setPhoneNumbers(phones);
    } catch (error) {
      console.error(error);
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

    } catch (error) {
      alert('Erro ao salvar campanha');
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase">Campanhas Ativas</p>
              <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-2">{activeCampaignsCount}</h3>
              <p className="text-xs text-slate-400 mt-1">em execução</p>
            </div>
            <div className="h-12 w-12 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center text-primary">
              <Phone className="w-6 h-6" />
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase">Total de Contatos</p>
              <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-2">{totalContacts}</h3>
              <p className="text-xs text-slate-400 mt-1">em todas as campanhas</p>
            </div>
            <div className="h-12 w-12 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300">
              <Users className="w-6 h-6" />
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase">Contatos Pendentes</p>
              <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-2">{pendingContacts}</h3>
              <p className="text-xs text-slate-400 mt-1">aguardando discagem</p>
            </div>
            <div className="h-12 w-12 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center text-primary">
              <Clock className="w-6 h-6" />
            </div>
          </div>
        </Card>
      </div>

      {/* Campaign List */}
      <Card className="p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Lista de Campanhas</h2>
            <button onClick={fetchCampaigns} className="p-1 text-slate-400 hover:text-primary"><RefreshCw className="w-4 h-4" /></button>
          </div>
          <Button icon={Plus} onClick={openCreateModal}>Nova Campanha</Button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400">Carregando campanhas do banco de dados...</div>
        ) : campaigns.length === 0 ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-dashed border-slate-300 dark:border-slate-700">
            Nenhuma campanha encontrada. Crie a primeira!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-700 text-xs uppercase font-semibold text-slate-500 dark:text-slate-300">
                <tr>
                  <th className="px-4 py-3 rounded-tl-lg">Nome</th>
                  <th className="px-4 py-3">Instituição</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-center">Contatos</th>
                  <th className="px-4 py-3 text-center">Ativo</th>
                  <th className="px-4 py-3 rounded-tr-lg text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {campaigns.map((campaign) => (
                  <tr key={campaign.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{campaign.name}</td>
                    <td className="px-4 py-3">{campaign.institution || '-'}</td>
                    <td className="px-4 py-3">
                      <Badge variant="neutral">{campaign.type}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={campaign.status === 'active' || campaign.status === 'completed' ? 'success' : 'neutral'}>
                        {campaign.status === 'active' ? 'Executando' : campaign.status === 'completed' ? 'Concluído' : campaign.status === 'draft' ? 'Rascunho' : 'Pausado'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center">{campaign.totalContacts || 0}</td>
                    <td className="px-4 py-3 text-center">
                      <div
                        onClick={(e) => toggleCampaign(e, campaign.id, campaign.active)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full cursor-pointer transition-colors ${campaign.active ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${campaign.active ? 'translate-x-6' : 'translate-x-1'}`} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={(e) => handleExecuteCampaign(e, campaign)}
                          disabled={executingId === campaign.id}
                          className={`p-1 rounded transition-colors ${executingId === campaign.id ? 'text-slate-400 cursor-not-allowed' : 'hover:bg-green-100 dark:hover:bg-green-900/40 text-green-600 dark:text-green-400'}`}
                          title="Executar (Disparar Webhook)"
                        >
                          {executingId === campaign.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => openEditModal(e, campaign)}
                          className="p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-primary"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          className="p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                        >
                          <Trash2 className="w-4 h-4" />
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
                  <option value="">{loadingVapi ? 'Carregando...' : 'Selecione uma linha...'}</option>
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
                <option value="">{loadingVapi ? 'Carregando...' : 'Selecione um assistente...'}</option>
                {assistants.map(assistant => (
                  <option key={assistant.id} value={assistant.id}>
                    {assistant.name || assistant.model?.model || 'Assistente sem nome'} ({assistant.id.slice(0, 5)}...)
                  </option>
                ))}
              </select>
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