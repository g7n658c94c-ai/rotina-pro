// server.js
// Backend leve para gerenciar assinaturas do ROTINA PRO via Kiwify + Supabase
//
// Fluxo:
// 1. Cliente compra na Kiwify -> Kiwify dispara webhook para /webhook/kiwify
// 2. Backend ativa/atualiza o assinante no Supabase
// 3. HTML do ROTINA PRO chama /check-access antes de liberar o app
// 4. Cron diário (endpoint /cron/expire) marca como expirado quem passou do período

const express = require('express');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();

// Precisamos do corpo bruto (raw) para validar a assinatura do webhook da Kiwify
app.use('/webhook/kiwify', express.raw({ type: '*/*' }));
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // use a service role key aqui, nunca a anon key
);

const KIWIFY_WEBHOOK_SECRET = process.env.KIWIFY_WEBHOOK_SECRET; // configurado no painel da Kiwify
const PLAN_DURATION_DAYS = 30;

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Valida a assinatura HMAC que a Kiwify envia no header (ver docs da Kiwify para o nome exato do header)
function isValidKiwifySignature(rawBody, signatureHeader) {
  if (!KIWIFY_WEBHOOK_SECRET || !signatureHeader) return false;
  const expected = crypto
    .createHmac('sha256', KIWIFY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

app.post('/webhook/kiwify', async (req, res) => {
  const signature = req.headers['x-kiwify-signature']; // confirme o nome exato no painel da Kiwify

  if (!isValidKiwifySignature(req.body, signature)) {
    console.warn('Webhook com assinatura inválida recebido');
    return res.sendStatus(401);
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.sendStatus(400);
  }

  const event = payload.event || payload.webhook_event_type;
  const order = payload.order || payload.data || {};
  const email = order?.customer?.email || order?.Customer?.email;

  if (!email) {
    console.warn('Webhook sem email de cliente', payload);
    return res.sendStatus(200); // responde 200 para a Kiwify não ficar reenviando
  }

  const ACTIVATING_EVENTS = ['order.approved', 'subscription.renewed', 'order.paid'];
  const DEACTIVATING_EVENTS = ['subscription.canceled', 'order.refunded', 'chargeback'];

  if (ACTIVATING_EVENTS.includes(event)) {
    const { error } = await supabase.from('subscribers').upsert(
      {
        email,
        status: 'active',
        plan: 'mensal',
        kiwify_order_id: order.id || order.order_id || null,
        current_period_end: addDays(new Date(), PLAN_DURATION_DAYS).toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'email' }
    );
    if (error) console.error('Erro ao ativar assinante:', error);
  }

  if (DEACTIVATING_EVENTS.includes(event)) {
    const { error } = await supabase
      .from('subscribers')
      .update({ status: 'canceled', updated_at: new Date().toISOString() })
      .eq('email', email);
    if (error) console.error('Erro ao cancelar assinante:', error);
  }

  res.sendStatus(200);
});

// Rota que o HTML do ROTINA PRO chama para saber se libera o app
app.get('/check-access', async (req, res) => {
  const email = (req.query.email || '').toLowerCase().trim();
  if (!email) return res.status(400).json({ active: false, reason: 'email ausente' });

  const { data, error } = await supabase
    .from('subscribers')
    .select('status, current_period_end')
    .eq('email', email)
    .single();

  if (error || !data) {
    return res.json({ active: false, reason: 'assinante não encontrado' });
  }

  const active =
    data.status === 'active' && new Date(data.current_period_end) > new Date();

  res.json({ active, current_period_end: data.current_period_end });
});

// Endpoint opcional para rodar via cron job diário (ex: Vercel Cron, GitHub Actions, cron-job.org)
// Marca como 'expired' quem passou do período mas ainda está como 'active'
// (proteção extra caso a Kiwify não envie o webhook de renovação a tempo)
app.get('/cron/expire', async (req, res) => {
  const { error } = await supabase
    .from('subscribers')
    .update({ status: 'expired' })
    .eq('status', 'active')
    .lt('current_period_end', new Date().toISOString());

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true });
});

app.get('/', (req, res) => res.send('ROTINA PRO backend rodando ✅'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
