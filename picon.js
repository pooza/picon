'use strict';

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

const createFileName = (request, params) => {
  const values = [];
  Object.keys(params).forEach(k => {
    values.push(k);
    values.push(params[k]);
  });
  const sha1 = crypto.createHash('sha1');
  values.push(fs.readFileSync(request.file.path));
  sha1.update(values.join('::'));
  return sha1.digest('hex') + '.png';
};

const sendResponseImage = (response, filepath, params) => {
  if (isExist(filepath)) {
    fs.readFile(filepath, (error, contents) => {
      if (error) {
        throw new Error(error);
      } else {
        console.info('%j', message);
        response.header('Content-Type', 'image/png');
        response.end(contents);
      }
    })
  } else {
    throw new Error(filepath + ' not found.');
  }
};

const sendErrorImage = response => {
  response.status(400);
  sendResponseImage(response, path.join(__dirname, 'blank.png'), {});
};

const getType = filepath => {
  return filetype(fs.readFileSync(filepath)).mime;
};

const isExist = filepath => {
  try {
    fs.statSync(filepath);
    return true
  } catch (error) {
    return false
  }
};

const isPDF = filepath => {
  return getType(filepath) == 'application/pdf';
};

const isVideo = filepath => {
  return config.video.types.indexOf(getType(filepath)) != -1;
};

const isOfficeDocument = filepath => {
  return config.office.types.indexOf(getType(filepath)) != -1;
};

const convertPDF = filepath => {
  return new Promise((resolve, reject) => {
    let dest = path.join(__dirname, 'tmp', path.basename(filepath, '.png') + '.png');
    gm(filepath).write(dest, error => {
      if (error) {
        reject(error);
      } else {
        const names = [
          dest,
          path.join(path.dirname(dest), path.basename(dest, '.png') + '-0.png'),
        ];
        dest = path.join(__dirname, 'www', path.basename(dest));

        names.forEach(src => {
          if (isExist(src)) {
            fs.copyFile(src, dest, error => {
              if (error) {
                reject(error.Error);
              } else {
                console.info('%j', {script:path.basename(__filename), copied:dest});
                resolve(dest);
              }
            })
          }
        })
        reject(src + 'not found.');
      }
    });
  });
};

const convertVideo = filepath => {
};

const convertOfficeDocument = filepath => {
  return new Promise((resolve, reject) => {
    const dest = path.join(__dirname, 'www', path.basename(filepath) + '.png');
    exec([
      'libreoffice',
      '--headless',
      '--nologo',
      '--nofirststartwizard',
      '--convert-to', 'png',
      '--outdir', shellescape([path.dirname(dest)]),
      shellescape([filepath]),
    ].join(' '));
    resolve(dest);
  });
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

app.post('/convert', upload.single('file'), (request, response, next) => {
  const params = Object.assign({}, request.body);
  params.function = 'convert';
  message.request = {path:request.path};
  delete message.error;

  if (isPDF(request.file.path)) {
    convertPDF(request.file.path).then(dest => {
      sendResponseImage(response, dest, params);
    }).catch(error => {
      sendErrorImage(response);
    });
  } else if (isVideo(request.file.path)) {
    sendResponseImage(response, convertVideo(request.file.path), params);
  } else if (isOfficeDocument(request.file.path)) {
    convertOfficeDocument(request.file.path).then(dest => {
      sendResponseImage(response, dest, params);
    }).catch(error => {
      sendErrorImage(response);
    });
  } else {
    sendErrorImage(response);
  }
});

app.post('/resize', upload.single('file'), (request, response, next) => {
  const params = Object.assign({}, request.body);
  params.function = 'resize';
  params.width = (params.width || 100);
  params.height = (params.height || 100);
  params.background_color = (params.background_color || 'white');
  message.request = {params:params, path:request.path};
  const dest = path.join(__dirname, 'www', createFileName(request, params));
  message.response = {sent:dest};
  delete message.error;

  if (isExist(dest)) {
    sendResponseImage(response, dest, params);
  } else {
    gm(request.file.path)
      .resize(params.width, params.height)
      .gravity('Center')
      .background(params.background_color)
      .extent(params.width, params.height)
      .write(dest, error => {
        if (error) {
          sendErrorImage(response);
        } else {
          console.info('%j', {script:path.basename(__filename), created:dest});
          sendResponseImage(response, dest, params);
        }
      });
  }
});

app.post('/resize_width', upload.single('file'), (request, response, next) => {
  const params = Object.assign({}, request.body);
  params.function = 'resize_width';
  params.width = (params.width || 100);
  params.method = (params.method || 'resize');
  message.request = {params:params, path:request.path};
  const dest = path.join(__dirname, 'www', createFileName(request, params));
  message.response = {sent:dest};
  delete message.error;

  if (isExist(dest)) {
    sendResponseImage(response, dest, params);
  } else {
    gm(request.file.path)[params.method](params.width, null).write(dest, error => {
      if (error) {
        sendErrorImage(response);
      } else {
        console.info('%j', {script:path.basename(__filename), created:dest});
        sendResponseImage(response, dest, params);
      }
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
