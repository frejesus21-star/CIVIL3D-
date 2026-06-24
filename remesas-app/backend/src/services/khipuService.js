const crypto = require('crypto');

const RECEIVER_ID = process.env.KHIPU_RECEIVER_ID || '520732';
const SECRET = process.env.KHIPU_SECRET || 'ad89bcdb55430c303544963bb439f0b2469b0c3c';
const API_BASE = 'https://khipu.com/api/2.0';

function hmacSign(method, url, params) {
  const sorted = Object.keys(params).sort().map(k =>
    encodeURIComponent(k) + '=' + encodeURIComponent(params[k])
  ).join('&');
  const msg = method.toUpperCase() + '&' + encodeURIComponent(url) + '&' + encodeURIComponent(sorted);
  return crypto.createHmac('sha256', SECRET).update(msg).digest('hex');
}

async function crearPago({ monto, asunto, transactionId, returnUrl, cancelUrl, notifyUrl, email }) {
  const url = API_BASE + '/payments';
  const params = {
    receiver_id: RECEIVER_ID,
    subject: asunto,
    currency: 'CLP',
    amount: String(Math.round(monto)),
    transaction_id: transactionId,
    return_url: returnUrl,
    cancel_url: cancelUrl,
    notify_url: notifyUrl,
  };
  if (email) params.payer_email = email;

  const signature = hmacSign('POST', url, params);

  const body = new URLSearchParams(params);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `${RECEIVER_ID}:${signature}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: body.toString(),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Khipu error ${res.status}`);
  return data; // { payment_id, payment_url, simplified_transfer_url, ... }
}

async function verificarPago(paymentId) {
  const url = `${API_BASE}/payments/${paymentId}`;
  const params = { receiver_id: RECEIVER_ID };
  const signature = hmacSign('GET', url, params);

  const res = await fetch(url + '?' + new URLSearchParams(params), {
    headers: {
      'Authorization': `${RECEIVER_ID}:${signature}`,
      'Accept': 'application/json',
    },
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Khipu error ${res.status}`);
  return data; // { status: 'done'|'pending'|... }
}

function verificarFirmaWebhook(params) {
  const { api_version, notification_token, receiver_id, subject, amount, currency,
    transaction_id, account_id, owner, payment_id } = params;
  const toSign = [api_version, notification_token, receiver_id, subject, amount, currency,
    transaction_id, account_id, owner, payment_id].join('&');
  const expected = crypto.createHmac('sha256', SECRET).update(toSign).digest('hex');
  return params.signature === expected;
}

module.exports = { crearPago, verificarPago, verificarFirmaWebhook };
