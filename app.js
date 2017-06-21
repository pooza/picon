var config = require('config').config;
var log = require('bslogger');
var fs = require('fs');
var crypto = require('crypto');
var gm = require('gm').subClass({imageMagick: true});;
var app = require('express')();
const ROOT_DIR = __dirname;

log.name = config.application.name;
var server = app.listen(config.server.port)
var message = {request:{}, response:{}};

app.get('/convert', function (request, response, next) {
  function getDestPath (params) {
    var sha1 = crypto.createHash('sha1');
    sha1.update([
      params.pixel,
      params.background_color,
      fs.readFileSync(params.path),
    ].join(' '));
    return ROOT_DIR + '/images/' + sha1.digest('hex') + '.png';
  }

  function isExist (path) {
    try {
      fs.statSync(path);
      return true
    } catch (error) {
      return false
    }
  }

  function output (path) {
    fs.readFile(path, function (error, contents) {
      if (error) {
        message.error = error.message;
        log.error(message);
        response.status(404);
        response.json(message);
      }
      delete message.error;
      message.response.sent = path;
      log.info(message);
      response.header('Content-Type', 'image/png');
      response.end(contents);
    })
  }

  message.request.path = request.path;
  message.request.params = request.query;
  var params = request.query;
  params.pixel = (params.pixel || 100);
  params.background_color = (params.background_color || 'white');
  message.request.params = params;

  if (!params.path) {
    message.error = 'pathが未設定です。';
    log.info(message);
    response.status(404);
    response.json(message);
    return;
  }
  var dest = getDestPath(params);
  if (isExist(dest)) {
    output(dest);
  } else {
    var image = gm(params.path)
      .resize(params.pixel, params.pixel)
      .gravity('Center')
      .background(params.background_color)
      .extent(params.pixel, params.pixel);
    image.write(dest, function () {
      log.info({'created': dest});
      output(dest);
    });
  }
});

app.use(function (request, response, next) {
  message.request.path = request.path;
  message.request.params = request.query;
  message.error = 'Not Found';
  log.error(message);
  response.status(404);
  response.json(message);
});

app.use(function (error, request, response, next) {
  message.request.path = request.path;
  message.request.params = request.query;
  message.error = error;
  log.error(message);
  response.status(500);
  response.json(message);
});
