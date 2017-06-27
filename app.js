'use strict';
const ROOT_DIR = __dirname;
const bodyparser = require('body-parser');
const config = require('config').config;
const log = require('bslogger');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const sprintf = require('sprintf-js');
const gm = require('gm').subClass({imageMagick: true});;
const express = require('express');
const upload = require('multer')({dest: path.join(ROOT_DIR, 'uploads')});

const app = express();
app.use(bodyparser.urlencoded({
  limit:'20mb', extended: true
}));
app.use(bodyparser.json());
app.use(express.static('www'));

log.name = config.application.name;
const server = app.listen(config.server.port)
const message = {request:{}, response:{}};
config.package = JSON.parse(
  fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8')
);
log.info({
  'message': 'starting...',
  'package': {
    'name': config.package.name,
    'version': config.package.version,
  },
  'server': {
    'port': config.server.port,
  },
});

app.post('/resize', upload.single('file'), function (request, response, next) {
  function getDestPath (params, blob) {
    const sha1 = crypto.createHash('sha1');
    sha1.update([
      '/resize',
      params.width,
      params.height,
      params.background_color,
      blob,
    ].join(' '));
    return path.join(ROOT_DIR, 'www', sha1.digest('hex') + '.png');
  }

  function isExist (path) {
    try {
      fs.statSync(path);
      return true
    } catch (error) {
      return false
    }
  }

  const params = Object.assign({}, request.body);
  params.width = (params.width || 100);
  params.height = (params.height || 100);
  params.background_color = (params.background_color || 'white');
  message.request.params = params;
  message.request.path = request.path;
  const dest = getDestPath(params, fs.readFileSync(request.file.path));

  if (isExist(dest)) {
    message.response.sent = dest;
    log.info(message);
    response.header('Content-Type', 'image/png');
    response.end(fs.readFileSync(dest));
  } else {
    const image = gm(request.file.path)
      .resize(params.width, params.height)
      .gravity('Center')
      .background(params.background_color)
      .extent(params.width, params.height);
    image.write(dest, function () {
      log.info({'created': dest});
      message.response.sent = dest;
      log.info(message);
      response.header('Content-Type', 'image/png');
      response.end(fs.readFileSync(dest));
    });
  }
});

app.post('/resize_width', upload.single('file'), function (request, response, next) {
  function getDestPath (params, blob) {
    const sha1 = crypto.createHash('sha1');
    sha1.update([
      '/resize_width',
      params.width,
      blob,
    ].join(' '));
    return path.join(ROOT_DIR, 'www', sha1.digest('hex') + '.png');
  }

  function isExist (path) {
    try {
      fs.statSync(path);
      return true
    } catch (error) {
      return false
    }
  }

  const params = Object.assign({}, request.body);
  params.width = (params.width || 100);
  message.request.params = params;
  message.request.path = request.path;
  const dest = getDestPath(params, fs.readFileSync(request.file.path));

  if (isExist(dest)) {
    message.response.sent = dest;
    log.info(message);
    response.header('Content-Type', 'image/png');
    response.end(fs.readFileSync(dest));
  } else {
    const image = gm(request.file.path).resize(params.width, null);
    image.write(dest, function () {
      log.info({'created': dest});
      message.response.sent = dest;
      log.info(message);
      response.header('Content-Type', 'image/png');
      response.end(fs.readFileSync(dest));
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