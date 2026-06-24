const notif = require('../services/notificationService');

async function listar(req, res) {
  res.json({
    notificaciones: await notif.listar(req.userId),
    no_leidas: await notif.contarNoLeidas(req.userId),
  });
}

async function contador(req, res) {
  res.json({ no_leidas: await notif.contarNoLeidas(req.userId) });
}

async function marcarLeida(req, res) {
  await notif.marcarLeida(req.userId, req.params.id);
  res.json({ ok: true });
}

async function marcarTodas(req, res) {
  await notif.marcarTodasLeidas(req.userId);
  res.json({ ok: true });
}

module.exports = { listar, contador, marcarLeida, marcarTodas };
