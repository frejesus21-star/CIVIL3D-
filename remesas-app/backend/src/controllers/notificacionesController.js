const notif = require('../services/notificationService');

function listar(req, res) {
  res.json({
    notificaciones: notif.listar(req.userId),
    no_leidas: notif.contarNoLeidas(req.userId),
  });
}

function contador(req, res) {
  res.json({ no_leidas: notif.contarNoLeidas(req.userId) });
}

function marcarLeida(req, res) {
  notif.marcarLeida(req.userId, req.params.id);
  res.json({ ok: true });
}

function marcarTodas(req, res) {
  notif.marcarTodasLeidas(req.userId);
  res.json({ ok: true });
}

module.exports = { listar, contador, marcarLeida, marcarTodas };
