'use strict';
process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection at:', p, 'reason:', reason);
});
process.on('uncaughtException', error => {
  console.error(error);
});

const config = require('config').config;
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const exec = require('child_process').execSync;
const shellescape = require('shell-escape');
const filetype = require('file-type');
const gm = require('gm').subClass({imageMagick:true});
const express = require('express');
const upload = require('multer')({dest:path.join(__dirname, 'tmp')});

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

const createFileName = (filepath, params) => {
  const values = [];
  Object.keys(params).forEach(k => {
    values.push(k);
    values.push(params[k]);
  });
  const sha1 = crypto.createHash('sha1');
  values.push(fs.readFileSync(filepath));
  sha1.update(values.join('::'));
  return sha1.digest('hex') + '.png';
};

const sendResponseImage = (response, filepath) => {
  const send = (contents) => {
    console.info('%j', message);
    response.header('Content-Type', 'image/png');
    response.end(contents);
  };
  const filepathAlt = path.join(
    path.dirname(filepath),
    path.basename(filepath, '.png') + '-0.png'
  );
  if (isExist(filepath)) {
    fs.readFile(filepath, (error, contents) => {send(contents)})
  } else if (isExist(filepathAlt)) {
    fs.copyFile(filepathAlt, filepath, () => {
      console.info('%j', {script:path.basename(__filename), copied:filepath});
      fs.readFile(filepath, (error, contents) => {send(contents)})
    })
  } else {
    throw new Error(filepath + ' not found.');
  }
};

const getSourcePath = filepath => {
  let source = filepath;
  if (isOfficeDocument(source)) {
    source = convertOfficeDocument(source);
  }
  return source;
};

const isOfficeDocument = filepath => {
  return config.office.types.indexOf(filetype(fs.readFileSync(filepath)).mime) != -1;
};

const convertOfficeDocument = filepath => {
  exec([
    'libreoffice',
    '--headless',
    '--nologo',
    '--nofirststartwizard',
    '--convert-to', 'png',
    '--outdir', shellescape([path.join(__dirname, 'tmp')]),
    shellescape([filepath]),
  ].join(' '));
  return path.join(
    __dirname,
    'tmp',
    path.basename(filepath, '.png') + '.png',
  );
};

const isExist = filepath => {
  try {
    fs.statSync(filepath);
    return true
  } catch (error) {
    return false
  }
}

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
  const source = getSourcePath(request.file.path);
  const params = Object.assign({}, request.body);
  params.function = 'resize';
  params.width = (params.width || 100);
  params.height = (params.height || 100);
  params.background_color = (params.background_color || 'white');
  message.request = {params:params, path:request.path};
  const dest = path.join(__dirname, 'www', createFileName(request.file.path, params));
  message.response = {sent:dest};
  delete message.error;

  if (isExist(dest)) {
    sendResponseImage(response, dest);
  } else {
    gm(source)
      .resize(params.width, params.height)
      .gravity('Center')
      .background(params.background_color)
      .extent(params.width, params.height)
      .write(dest, () => {
        console.info('%j', {script:path.basename(__filename), created:dest});
        sendResponseImage(response, dest);
      });
  }
});

app.post('/resize_width', upload.single('file'), (request, response, next) => {
  const source = getSourcePath(request.file.path);
  const params = Object.assign({}, request.body);
  params.function = 'resize_width';
  params.width = (params.width || 100);
  params.method = (params.method || 'resize');
  message.request = {params:params, path:request.path};
  const dest = path.join(__dirname, 'www', createFileName(request.file.path, params));
  message.response = {sent:dest};
  delete message.error;

  if (isExist(dest)) {
    sendResponseImage(response, dest);
  } else {
    gm(source)[params.method](params.width, null).write(dest, () => {
      console.info('%j', {script:path.basename(__filename), created:dest});
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
