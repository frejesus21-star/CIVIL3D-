const API_KEY = process.env.KHIPU_API_KEY || '41d120f3-6bd3-48bc-a5c9-9de520a7a44c';
const API_BASE = 'https://payment-api.khipu.com/v3';

async function crearPago({ monto, asunto, transactionId, returnUrl, cancelUrl, notifyUrl, email }) {
  const body = {
    amount: Math.round(monto),
    currency: 'CLP',
    subject: asunto,
    transaction_id: transactionId,
    return_url: returnUrl,
    cancel_url: cancelUrl,
    notify_url: notifyUrl,
  };
  if (email) body.payer_email = email;

  const res = await fetch(`${API_BASE}/payments`, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Khipu error ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function obtenerPago(paymentId) {
  const res = await fetch(`${API_BASE}/payments/${paymentId}`, {
    headers: {
      'x-api-key': API_KEY,
      'Accept': 'application/json',
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Khipu error ${res.status}`);
  return data;
}

module.exports = { crearPago, obtenerPago };
