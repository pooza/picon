'use strict';

const config = require('config').config;
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const exec = require('child_process').exec;
const shellescape = require('shell-escape');
const filetype = require('file-type');
const {CronJob} = require('cron');
const gm = require('gm').subClass({imageMagick: true});
const ffmpeg = require('fluent-ffmpeg');
const app = require('express')();
const upload = require('multer')({dest: path.join(__dirname, 'tmp')});

app.listen(config.server.port, config.server.address);
config.package = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')
);
const message = {request: {}, response: {}};
console.info('%j', {
  message: 'starting...',
  package: {name: config.package.name, version: config.package.version},
  server: {port: config.server.port},
});

const createFileName = (f, params) => {
  const values = [];
  Object.keys(params).forEach(k => {
    values.push(k);
    values.push(params[k]);
  });
  const sha1 = crypto.createHash('sha1');
  values.push(fs.readFileSync(f));
  sha1.update(values.join('::'));
  return sha1.digest('hex') + '.png';
};

const sendImage = (response, f, params) => {
  fs.readFile(f, (error, contents) => {
    if (error) {
      throw new Error(error);
    } else {
      console.info('%j', message);
      response.header('Content-Type', 'image/png');
      response.end(contents);
    }
  })
};

const getType = f => {
  return filetype(fs.readFileSync(f)).mime;
};

const isExist = f => {
  try {
    fs.statSync(f);
    return true
  } catch (error) {
    return false
  }
};

const isPDF = f => {
  return getType(f) == 'application/pdf';
};

const isVideo = f => {
  return config.video.types.indexOf(getType(f)) != -1;
};

const isOfficeDocument = f => {
  return config.office.types.indexOf(getType(f)) != -1;
};

const convertPDF = f => {
  return new Promise((resolve, reject) => {
    const dest = path.join(__dirname, 'tmp', path.basename(f, '.png') + '.png');
    gm(f).write(dest, error => {
      if (error) {
        message.error = {status: 400, message: error};
        throw new Error(message.error.message);
      }
      [
        dest,
        path.join(path.dirname(dest), path.basename(dest, '.png') + '-0.png'),
      ].forEach(name => {
        if (isExist(name)) {
          console.info('%j', {action: 'convert', type: 'pdf', src: f, dest: name});
          resolve(name);
        }
      })
    });
  });
};

const convertVideo = f => {
  return new Promise((resolve, reject) => {
    const dest = path.join(__dirname, 'tmp', path.basename(f) + '.png');
    ffmpeg(f).screenshots({
      timemarks: [0],
      folder: path.dirname(dest),
      filename: path.basename(dest),
    }).on('end', (stdout, stderr) => {
      console.info('%j', {action: 'convert', type: 'video', src: f, dest: dest});
      resolve(dest);
    }).on('error', (error, stdout, stderr) => {
      message.error = {status: 400, message: error};
      throw new Error(message.error.message);
    });
  });
};

const convertOfficeDocument = f => {
  return new Promise((resolve, reject) => {
    const dest = path.join(__dirname, 'tmp', path.basename(f) + '.png');
    const command = [
      'libreoffice',
      '--headless',
      '--nologo',
      '--nofirststartwizard',
      '--convert-to', 'png',
      '--outdir', shellescape([path.dirname(dest)]),
      shellescape([f]),
    ].join(' ');
    exec(command, (error, stdout, stderr) => {
      if (error) {
        message.error = {status: 400, message: error};
        throw new Error(message.error.message);
      } else {
        console.info('%j', {action: 'convert', type: 'office', src: f, dest: dest});
        resolve(dest);
      }
    });
  });
};

app.get('/about', (request, response, next) => {
  message.request = {path: request.path};
  message.response = {};
  delete message.error;
  console.info('%j', message);
  response.json({
    package: config.package,
    config: config.server,
    purge: config.purge,
  });
});

app.post('/convert', upload.single('file'), (request, response, next) => {
  const params = Object.assign({}, request.body);
  params.function = 'convert';
  message.request = {path: request.path};
  delete message.error;

  if (!request.file) {
    message.error = {status: 400, message: 'File was not posted'};
    throw new Error(message.error.message);
  } else if (isPDF(request.file.path)) {
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
    message.error = {status: 400, message: 'Invalid file type'};
    throw new Error(message.error.message);
  }
});

app.post('/resize', upload.single('file'), (request, response, next) => {
  if (!request.file) {
    message.error = {status: 400, message: 'File was not posted'};
    throw new Error(message.error.message);
  }

  const params = Object.assign({}, request.body);
  params.function = 'resize';
  params.width = (params.width || 100);
  params.height = (params.height || 100);
  params.background_color = (params.background_color || 'white');
  message.request = {params: params, path: request.path};
  const dest = path.join(__dirname, 'tmp', createFileName(request.file.path, params));
  delete message.error;

  gm(request.file.path)
    .resize(params.width, params.height)
    .gravity('Center')
    .background(params.background_color)
    .extent(params.width, params.height)
    .write(dest, error => {
      if (error) {
        message.error = {status: 400, message: error};
        throw new Error(message.error.message);
      } else {
        message.response = {action: 'resize', sent: dest};
        sendImage(response, dest, params);
      }
    });
});

app.post('/resize_width', upload.single('file'), (request, response, next) => {
  if (!request.file) {
    message.error = {status: 400, message: 'File was not posted'};
    throw new Error(message.error.message);
  }

  const params = Object.assign({}, request.body);
  params.function = 'resize_width';
  params.width = (params.width || 100);
  params.method = (params.method || 'resize');
  message.request = {params: params, path: request.path};
  const dest = path.join(__dirname, 'tmp', createFileName(request.file.path, params));
  delete message.error;

  gm(request.file.path)[params.method](params.width, null).write(dest, error => {
    if (error) {
      message.error = {status: 400, message: error};
      throw new Error(message.error.message);
    } else {
      message.response = {action: 'resize', sent: dest};
      sendImage(response, dest, params);
    }
  });
});

app.use((request, response, next) => {
  message.request = {params: request.query, path: request.path};
  message.response = {};
  message.error = {status: 404, message: 'Not found'};
  console.error('%j', message);
  response.status(message.error.status);
  response.json(message);
});

app.use((error, request, response, next) => {
  message.request = {params: request.query, path: request.path};
  message.response = {};
  message.error = message.error || {status: 500, message: error.message};
  console.error('%j', message);
  response.status(message.error.status);
  response.json(message);
});

new CronJob(config.purge.cron, () => {
  const dir = path.join(__dirname, 'tmp');
  fs.readdir(dir, (error, files) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - config.purge.days);

    files.filter(f => {
      const stat = fs.statSync(path.join(__dirname, 'tmp', f));
      return stat.isFile() && !f.match(/^\./) && (stat.mtime < yesterday);
    }).forEach(f => {
      fs.unlink(path.join(dir, f), error => {
        if (error) {
          console.error('%j', {path: path.join(dir, f), error: error});
        } else {
          console.info('%j', {path: path.join(dir, f), action: 'delete'});
        }
      });
    });
  });
}, null, true);
