export type ContactStatus =
  | 'pending'
  | 'enqueued'
  | 'attempt_1'
  | 'attempt_2'
  | 'attempt_3'
  | 'success'
  | 'failed';

export type CampaignStatus = 'draft' | 'queued' | 'running' | 'done' | 'failed';

export type ContactInput = {
  name: string;
  cpf: string;
  institution: string | null;
  phones: string[];
};
