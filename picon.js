'use strict';

const config = require('config').config;
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const exec = require('child_process').exec;
const shellescape = require('shell-escape');
const filetype = require('file-type');
const {CronJob} = require('cron');
const gm = require('gm').subClass({imageMagick:true});
const ffmpeg = require('fluent-ffmpeg');
const express = require('express');
const upload = require('multer')({dest:path.join(__dirname, 'tmp')});

new CronJob(config.purge.cron, () => {
  const dir = path.join(__dirname, 'tmp');
  fs.readdir(dir, (error, files) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - config.purge.days);

    files.filter(file => {
      const fileStat = fs.statSync(path.join(__dirname, 'tmp', file));
      return fileStat.isFile() && !file.match(/^\./) && (fileStat.mtime < yesterday);
    }).forEach(file => {
      const filePath = path.join(__dirname, 'tmp', file);
      fs.unlink(filePath, error => {
        if (error) {
          console.error('%j', {path:filePath, message:error});
        } else {
          console.info('%j', {path:filePath, message:'deleted'});
        }
      });
    });
  });
}, null, true);

const app = express();
app.use(express.static('www'));
app.listen(config.server.port);
config.package = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')
);
const message = {request:{}, response:{}};
console.info('%j', {
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

const sendImage = (response, filepath, params) => {
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

const sendErrorImage = (response, status) => {
  response.status(status || 400);
  sendImage(response, path.join(__dirname, 'blank.png'), {});
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
      const names = [
        dest,
        path.join(path.dirname(dest), path.basename(dest, '.png') + '-0.png'),
      ];
      dest = path.join(__dirname, 'www', path.basename(dest));

      names.forEach(src => {
        if (isExist(src)) {
          fs.copyFile(src, dest, error => {
            console.info('%j', {copied:dest});
            resolve(dest);
          })
        }
      })
    });
  });
};

const convertVideo = filepath => {
  return new Promise((resolve, reject) => {
    const dest = path.join(__dirname, 'www', path.basename(filepath) + '.png');
    ffmpeg(filepath).screenshots({
      timemarks: [0],
      folder:path.dirname(dest),
      filename:path.basename(dest),
    }).on('end', () => {
      resolve(dest);
    });
  });
};

const convertOfficeDocument = filepath => {
  return new Promise((resolve, reject) => {
    const dest = path.join(__dirname, 'www', path.basename(filepath) + '.png');
    const command = [
      'libreoffice',
      '--headless',
      '--nologo',
      '--nofirststartwizard',
      '--convert-to', 'png',
      '--outdir', shellescape([path.dirname(dest)]),
      shellescape([filepath]),
    ].join(' ');
    exec(command, (error, stdout, stderr) => {
      resolve(dest);
    });
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
      sendImage(response, dest, params);
    });
  } else if (isVideo(request.file.path)) {
    convertVideo(request.file.path).then(dest => {
      sendImage(response, dest, params);
    });
  } else if (isOfficeDocument(request.file.path)) {
    convertOfficeDocument(request.file.path).then(dest => {
      sendImage(response, dest, params);
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
    sendImage(response, dest, params);
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
          console.info('%j', {created:dest});
          sendImage(response, dest, params);
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
    sendImage(response, dest, params);
  } else {
    gm(request.file.path)[params.method](params.width, null).write(dest, error => {
      if (error) {
        sendErrorImage(response);
      } else {
        console.info('%j', {created:dest});
        sendImage(response, dest, params);
      }
    });
  }
});

app.use((request, response, next) => {
  message.request = {params:request.query, path:request.path};
  message.response = {};
  message.error = 'Not Found';
  console.error('%j', message);
  sendErrorImage(response, 404);
});

app.use((error, request, response, next) => {
  message.request = {params:request.query, path:request.path};
  message.response = {};
  message.error = error;
  console.error('%j', message);
  sendErrorImage(response, 500);
});
