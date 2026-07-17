-- ==============================================================================
-- Detecta voicemail por frases conhecidas na transcricao das chamadas
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.normalize_voicemail_text(p_value text)
RETURNS text AS $$
BEGIN
  RETURN lower(
    translate(
      COALESCE(p_value, ''),
      U&'\00C1\00C0\00C2\00C3\00C4\00E1\00E0\00E2\00E3\00E4\00C9\00C8\00CA\00CB\00E9\00E8\00EA\00EB\00CD\00CC\00CE\00CF\00ED\00EC\00EE\00EF\00D3\00D2\00D4\00D5\00D6\00F3\00F2\00F4\00F5\00F6\00DA\00D9\00DB\00DC\00FA\00F9\00FB\00FC\00C7\00E7',
      'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'
    )
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.call_transcript_is_voicemail(p_transcript text)
RETURNS boolean AS $$
DECLARE
  v_text text;
BEGIN
  v_text := public.normalize_voicemail_text(p_transcript);

  IF trim(v_text) = '' THEN
    RETURN false;
  END IF;

  RETURN
    v_text LIKE '%vamos entregar o seu recado assim que o celular estiver disponivel%'
    OR v_text LIKE '%assim que o celular estiver disponivel%'
    OR v_text LIKE '%otimo assim que o telefone estiver disponivel eu entrego seu recado%'
    OR v_text LIKE '%otimo, assim que o telefone estiver disponivel eu entrego seu recado%'
    OR v_text LIKE '%assim que o telefone estiver disponivel eu entrego seu recado%'
    OR (
      v_text LIKE '%permaneca na linha%'
      AND v_text LIKE '%esta pessoa nao esta disponivel%'
    )
    OR (
      v_text LIKE '%permanezca na linha%'
      AND v_text LIKE '%esta pessoa nao esta disponivel%'
    )
    OR (
      v_text LIKE '%permane% na linha%'
      AND v_text LIKE '%deixe outra mensagem apos o sinal%'
    )
    OR v_text LIKE '%esta pessoa nao esta disponivel se desejar deixe outra mensagem apos o sinal%'
    OR v_text LIKE '%esta pessoa nao esta disponivel, se desejar, deixe outra mensagem apos o sinal%'
    OR v_text LIKE '%deixe sua mensagem apos o sinal%'
    OR v_text LIKE '%deixe seu recado apos o sinal%'
    OR v_text LIKE '%grave sua mensagem apos o sinal%'
    OR v_text LIKE '%caixa postal%';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.set_call_voicemail_from_transcript()
RETURNS trigger AS $$
BEGIN
  IF public.call_transcript_is_voicemail(NEW.transcript) THEN
    NEW.ended_reason := 'voicemail-reached';
    NEW.status := 'voicemail-reached';

    IF NEW.success_evaluation IS NULL OR lower(NEW.success_evaluation::text) IN ('true', '1', 'yes', 'sim') THEN
      NEW.success_evaluation := 'false';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calls_set_voicemail_from_transcript ON public.calls;
CREATE TRIGGER trg_calls_set_voicemail_from_transcript
BEFORE INSERT OR UPDATE OF transcript ON public.calls
FOR EACH ROW
EXECUTE FUNCTION public.set_call_voicemail_from_transcript();

CREATE OR REPLACE FUNCTION public.sync_campaign_contact_from_voicemail_call()
RETURNS trigger AS $$
DECLARE
  v_attempts integer;
  v_max_attempts integer;
  v_next_status text;
BEGIN
  IF NEW.campaign_contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.call_transcript_is_voicemail(NEW.transcript)
     AND lower(COALESCE(NEW.ended_reason, '')) <> 'voicemail-reached' THEN
    RETURN NEW;
  END IF;

  SELECT
    COALESCE(cc.tentativas_realizadas, 0),
    COALESCE(c.max_tentativas, 3)
  INTO v_attempts, v_max_attempts
  FROM public.campaign_contacts cc
  LEFT JOIN public.campaigns c ON c.id::text = cc.campaign_id::text
  WHERE cc.id::text = NEW.campaign_contact_id::text
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_next_status := CASE
    WHEN v_attempts >= v_max_attempts THEN 'falhou'
    ELSE 'pendente'
  END;

  UPDATE public.campaign_contacts
  SET status = v_next_status,
      ultima_tentativa = now()
  WHERE id::text = NEW.campaign_contact_id::text;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calls_sync_campaign_contact_from_voicemail ON public.calls;
CREATE TRIGGER trg_calls_sync_campaign_contact_from_voicemail
AFTER INSERT OR UPDATE OF transcript, ended_reason ON public.calls
FOR EACH ROW
EXECUTE FUNCTION public.sync_campaign_contact_from_voicemail_call();

UPDATE public.calls
SET ended_reason = 'voicemail-reached',
    status = 'voicemail-reached',
    success_evaluation = 'false'
WHERE public.call_transcript_is_voicemail(transcript)
  AND (
    lower(COALESCE(ended_reason, '')) <> 'voicemail-reached'
    OR lower(COALESCE(status, '')) <> 'voicemail-reached'
    OR lower(COALESCE(success_evaluation::text, '')) IN ('', 'true', '1', 'yes', 'sim')
  );
