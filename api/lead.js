// Recebe leads dos formulários do site e cria a task direto em
// Vendas > Pipeline Principal no ClickUp. Token nunca fica no client.

const CLICKUP_LIST_ID = '901715489707'; // Vendas > Pipeline Principal

// IDs dos campos personalizados da Pipeline Principal (ver Ecossistema ClickUp - LocalTECH.md)
const FIELDS = {
  telefone: '9e584756-ce83-4718-85aa-8f27935e98f0',
  leadSource: '4bc31897-4a98-410e-831a-76c608db7471',
  indicacao: '1a50bec5-2bff-4cef-9e2c-6899a9a4ed65',
};

const LEAD_SOURCE_OPTIONS = {
  organico: '15a377b1-6185-4cd6-9e12-ad3f9273efec',
  indicacao: '9d9a5cd7-b305-41b7-837a-8998ac1b4c27',
};

// Campo "Telefone" do ClickUp só aceita formato internacional (+55...)
function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  const withCountry = digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`;
  return `+${withCountry}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) {
    res.status(500).json({ error: 'server_misconfigured' });
    return;
  }

  const body = req.body || {};

  // honeypot: campo invisível no form que só bot preenche
  if (body.website) {
    res.status(200).json({ ok: true });
    return;
  }

  let task;
  try {
    if (body.source === 'landing-page') {
      task = buildLandingPageTask(body);
    } else if (body.source === 'indicacao') {
      task = buildIndicacaoTask(body);
    } else if (body.source === 'institucional') {
      task = buildInstitucionalTask(body);
    } else {
      res.status(400).json({ error: 'invalid_source' });
      return;
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
    return;
  }

  const clickupRes = await fetch(`https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/task`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
    },
    body: JSON.stringify(task),
  });

  if (!clickupRes.ok) {
    console.error('ClickUp API error:', clickupRes.status, await clickupRes.text());
    res.status(502).json({ error: 'clickup_error' });
    return;
  }

  res.status(200).json({ ok: true });
};

function buildLandingPageTask(body) {
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const phone = String(body.phone || '').trim();
  const company = String(body.company || '').trim();
  const revenue = String(body.revenue || '').trim();

  if (!name || !email || !phone) throw new Error('missing_required_fields');

  const description = [
    '**Origem:** Landing Page',
    `**E-mail:** ${email}`,
    company ? `**Empresa:** ${company}` : null,
    revenue ? `**Faturamento aproximado:** ${revenue}` : null,
  ].filter(Boolean).join('\n');

  return {
    name: company ? `${name} (${company})` : name,
    description,
    custom_fields: [
      { id: FIELDS.telefone, value: normalizePhone(phone) },
      { id: FIELDS.leadSource, value: LEAD_SOURCE_OPTIONS.organico },
    ],
  };
}

function buildInstitucionalTask(body) {
  const name = String(body.name || '').trim();
  const phone = String(body.phone || '').trim();
  const company = String(body.company || '').trim();

  if (!name || !phone) throw new Error('missing_required_fields');

  const description = [
    '**Origem:** Site institucional',
    company ? `**Empresa:** ${company}` : null,
  ].filter(Boolean).join('\n');

  return {
    name: company ? `${name} (${company})` : name,
    description,
    custom_fields: [
      { id: FIELDS.telefone, value: normalizePhone(phone) },
      { id: FIELDS.leadSource, value: LEAD_SOURCE_OPTIONS.organico },
    ],
  };
}

function buildIndicacaoTask(body) {
  const referrerName = String(body.referrerName || '').trim();
  const referrerCompany = String(body.referrerCompany || '').trim();
  const referredName = String(body.referredName || '').trim();
  const referredWhatsapp = String(body.referredWhatsapp || '').trim();

  if (!referredName || !referredWhatsapp) throw new Error('missing_required_fields');

  const referenceLabel = referrerCompany ? `${referrerName} (${referrerCompany})` : referrerName;

  const description = [
    '**Origem:** Página de Indicação',
    `**Indicado por:** ${referenceLabel || 'não informado'}`,
  ].join('\n');

  return {
    name: referredName,
    description,
    custom_fields: [
      { id: FIELDS.telefone, value: normalizePhone(referredWhatsapp) },
      { id: FIELDS.leadSource, value: LEAD_SOURCE_OPTIONS.indicacao },
      { id: FIELDS.indicacao, value: referenceLabel || 'Não informado' },
    ],
  };
}
