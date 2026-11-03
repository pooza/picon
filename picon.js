'use strict'

const config = require('config').config
const fs = require('fs')
const crypto = require('crypto')
const path = require('path')
const {execFile} = require('child_process')
const {CronJob} = require('cron')
const gm = require('gm').subClass({imageMagick: true})
const ffmpeg = require('fluent-ffmpeg')
const app = require('express')()
const tmpDir = path.join(__dirname, 'tmp')
const upload = require('multer')({dest: tmpDir})

app.listen(config.server.port, config.server.address)
config.package = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')
)
console.info('%j', {
  message: 'starting...',
  package: {name: config.package.name, version: config.package.version},
  server: {port: config.server.port},
})

class PiconError extends Error {
  constructor(status, message, detail) {
    super(message)
    this.status = status
    this.detail = detail
  }
}

const conversionFailed = error => {
  return new PiconError(400, 'Conversion failed', String(error.message || error))
}

const createFileName = (f, params) => {
  const values = []
  Object.keys(params).forEach(k => {
    values.push(k)
    values.push(params[k])
  })
  const sha1 = crypto.createHash('sha1')
  values.push(fs.readFileSync(f))
  sha1.update(values.join('::'))
  return sha1.digest('hex') + '.png'
}

const sendImage = async (response, f, message) => {
  const contents = await fs.promises.readFile(f)
  console.info('%j', message)
  response.header('Content-Type', 'image/png')
  response.end(contents)
}

const getType = async f => {
  const {fileTypeFromFile} = await import('file-type')
  const type = await fileTypeFromFile(f)
  return type ? type.mime : null
}

const isExist = f => {
  try {
    fs.statSync(f)
    return true
  } catch (error) {
    return false
  }
}

const writeImage = (image, dest) => {
  return new Promise((resolve, reject) => {
    image.write(dest, error => {
      if (error) {
        reject(conversionFailed(error))
      } else {
        resolve(dest)
      }
    })
  })
}

const convertPDF = async f => {
  const dest = path.join(tmpDir, path.basename(f, '.png') + '.png')
  await writeImage(gm(f), dest)
  const name = [
    dest,
    path.join(path.dirname(dest), path.basename(dest, '.png') + '-0.png'),
  ].find(isExist)
  if (!name) {
    throw new PiconError(400, 'PDF was not converted')
  }
  console.info('%j', {action: 'convert', type: 'pdf', src: f, dest: name})
  return name
}

const convertVideo = f => {
  return new Promise((resolve, reject) => {
    const dest = path.join(tmpDir, path.basename(f) + '.png')
    ffmpeg(f).screenshots({
      timemarks: [0],
      folder: path.dirname(dest),
      filename: path.basename(dest),
    }).on('end', (stdout, stderr) => {
      console.info('%j', {action: 'convert', type: 'video', src: f, dest: dest})
      resolve(dest)
    }).on('error', (error, stdout, stderr) => {
      reject(conversionFailed(error))
    })
  })
}

const convertOfficeDocument = f => {
  return new Promise((resolve, reject) => {
    const dest = path.join(tmpDir, path.basename(f) + '.png')
    const args = [
      '--headless',
      '--nologo',
      '--nofirststartwizard',
      '--convert-to', 'png',
      '--outdir', path.dirname(dest),
      f,
    ]
    execFile('libreoffice', args, (error, stdout, stderr) => {
      if (error) {
        reject(conversionFailed(error))
      } else {
        console.info('%j', {action: 'convert', type: 'office', src: f, dest: dest})
        resolve(dest)
      }
    })
  })
}

const assertImage = async f => {
  const type = await getType(f)
  if (!config.image.types.includes(type)) {
    throw new PiconError(400, 'Invalid file type')
  }
}

app.get('/about', (request, response) => {
  console.info('%j', {request: {path: request.path}, response: {}})
  response.json({
    package: config.package,
    config: config.server,
    purge: config.purge,
  })
})

app.post('/convert', upload.single('file'), async (request, response) => {
  const params = Object.assign({}, request.body)
  params.function = 'convert'
  const message = {request: {path: request.path}, response: {}}

  if (!request.file) {
    throw new PiconError(400, 'File was not posted')
  }
  const type = await getType(request.file.path)
  let dest
  if (type == 'application/pdf') {
    dest = await convertPDF(request.file.path)
  } else if (config.video.types.includes(type)) {
    dest = await convertVideo(request.file.path)
  } else if (config.office.types.includes(type)) {
    dest = await convertOfficeDocument(request.file.path)
  } else {
    throw new PiconError(400, 'Invalid file type')
  }
  await sendImage(response, dest, message)
})

app.post('/resize', upload.single('file'), async (request, response) => {
  if (!request.file) {
    throw new PiconError(400, 'File was not posted')
  }

  const params = Object.assign({}, request.body)
  await assertImage(request.file.path)
  params.function = 'resize'
  params.width = (params.width || 100)
  params.height = (params.height || 100)
  params.background_color = (params.background_color || 'white')
  const message = {request: {params: params, path: request.path}}
  const dest = path.join(tmpDir, createFileName(request.file.path, params))

  await writeImage(
    gm(request.file.path)
      .noProfile()
      .resize(params.width, params.height)
      .gravity('Center')
      .background(params.background_color)
      .extent(params.width, params.height),
    dest
  )
  message.response = {action: 'resize', sent: dest}
  await sendImage(response, dest, message)
})

app.post('/resize_width', upload.single('file'), async (request, response) => {
  if (!request.file) {
    throw new PiconError(400, 'File was not posted')
  }

  const params = Object.assign({}, request.body)
  await assertImage(request.file.path)
  params.function = 'resize_width'
  params.width = (params.width || 100)
  params.method = (params.method || 'resize')
  if (!['resize', 'thumbnail', 'sample', 'scale'].includes(params.method)) {
    throw new PiconError(400, 'Invalid method')
  }
  const message = {request: {params: params, path: request.path}}
  const dest = path.join(tmpDir, createFileName(request.file.path, params))

  await writeImage(gm(request.file.path).noProfile()[params.method](params.width, null), dest)
  message.response = {action: 'resize', sent: dest}
  await sendImage(response, dest, message)
})

app.use((request, response, next) => {
  const message = {
    request: {params: request.query, path: request.path},
    response: {},
    error: {status: 404, message: 'Not found'},
  }
  console.error('%j', message)
  response.status(message.error.status)
  response.json(message)
})

app.use((error, request, response, next) => {
  const message = {
    request: {params: request.query, path: request.path},
    response: {},
    error: {status: error.status || 500, message: error.message},
  }
  console.error('%j', {...message, detail: error.detail || error.stack})
  response.status(message.error.status)
  response.json(message)
})

new CronJob(config.purge.cron, () => {
  fs.readdir(tmpDir, (error, files) => {
    if (error) {
      console.error('%j', {path: tmpDir, error: error.message})
      return
    }
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - config.purge.days)

    files.filter(f => {
      try {
        const stat = fs.statSync(path.join(tmpDir, f))
        return stat.isFile() && !f.match(/^\./) && (stat.mtime < yesterday)
      } catch (error) {
        return false
      }
    }).forEach(f => {
      fs.unlink(path.join(tmpDir, f), error => {
        if (error) {
          console.error('%j', {path: path.join(tmpDir, f), error: error.message})
        } else {
          console.info('%j', {path: path.join(tmpDir, f), action: 'delete'})
        }
      })
    })
  })
}, null, true)
