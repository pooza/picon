'use strict';
process.on('unhandledRejection', (error, p) => {
  console.error(error);
});

const config = require('config').config;
const fs = require('fs');
const fileUtils = require('file_utils');
const path = require('path');
const gm = require('gm').subClass({imageMagick:true});
const express = require('express');
const upload = require('multer')({dest:path.join(__dirname, 'uploads')});

const app = express();
app.use(express.static('www'));
app.listen(config.server.port);
config.package = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')
);
const message = {script:path.basename(__filename), request:{}, response:{}};
console.info('%j', {
  script:path.basename(__filename),
  message:'starting...',
  package:{name:config.package.name, version:config.package.version},
  server:{port:config.server.port},
});

const createFileName = (filepath, values) => {
  values.push(fs.readFileSync(filepath));
  return fileUtils.createFileName(values, '.png');
};

const sendResponseImage = (response, filepath) => {
  const filepathAlt = path.join(
    path.dirname(filepath),
    path.basename(filepath, '.png') + '-0.png'
  );
  if (fileUtils.isExist(filepath)) {
    console.info('%j', {script:path.basename(__filename), created:filepath});
    fs.readFile(filepath, (error, contents) => {
      console.info('%j', message);
      response.header('Content-Type', 'image/png');
      response.end(contents);
    })
  } else if (fileUtils.isExist(filepathAlt)) {
    fs.copyFile(filepathAlt, filepath, () => {
      console.info('%j', {script:path.basename(__filename), created:filepath});
      fs.readFile(filepath, (error, contents) => {
        console.info('%j', message);
        response.header('Content-Type', 'image/png');
        response.end(contents);
      })
    })
  } else {
    throw new Error(filepath + ' not found.');
  }
};

app.get('/about', (request, response, next) => {
  message.request = {path:request.path};
  message.response = {};
  delete message.error;
  console.info('%j', message);
  response.json({
    package:config.package,
    config:config.server,
    purge:config.purge,
  });
});

app.post('/resize', upload.single('file'), (request, response, next) => {
  const params = Object.assign({}, request.body);
  params.width = (params.width || 100);
  params.height = (params.height || 100);
  params.background_color = (params.background_color || 'white');
  message.request = {params:params, path:request.path};
  const dest = path.join(__dirname, 'www', createFileName(request.file.path, [
    '/resize',
    params.width,
    params.height,
    params.background_color,
  ]));
  message.response = {sent:dest};
  delete message.error;

  if (fileUtils.isExist(dest)) {
    sendResponseImage(response, dest);
  } else {
    const image = gm(request.file.path)
      .resize(params.width, params.height)
      .gravity('Center')
      .background(params.background_color)
      .extent(params.width, params.height);
    image.write(dest, () => {
      sendResponseImage(response, dest);
    });
  }
});

app.post('/resize_width', upload.single('file'), (request, response, next) => {
  const params = Object.assign({}, request.body);
  params.width = (params.width || 100);
  params.method = (params.method || 'resize');
  message.request = {params:params, path:request.path};
  const dest = path.join(__dirname, 'www', createFileName(request.file.path, [
    '/resize_width',
    params.width,
    params.method,
  ]));
  message.response = {sent:dest};
  delete message.error;

  if (fileUtils.isExist(dest)) {
    sendResponseImage(response, dest);
  } else {
    gm(request.file.path)[params.method](params.width, null).write(dest, () => {
      sendResponseImage(response, dest);
    });
  }
});

app.use((request, response, next) => {
  message.request = {params:request.query, path:request.path};
  message.response = {};
  message.error = 'Not Found';
  console.error('%j', message);
  response.status(404);
  response.json(message);
});

app.use((error, request, response, next) => {
  message.request = {params:request.query, path:request.path};
  message.response = {};
  message.error = error;
  console.error('%j', message);
  response.status(500);
  response.json(message);
});
