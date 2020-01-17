'use strict'

const request = require('supertest')
const path = require('path')
const config = require('config').config
const app = request('http://localhost:' + config.server.port)

app.get('/notfound')
  .expect(404)
  .expect('Content-Type', /json/)
  .catch(err => {throw err})

app.get('/about')
  .expect(200)
  .expect('Content-Type', /json/)
  .catch(err => {throw err})

const dir = path.join(__dirname, 'sample')

let exts = ['jpg', 'png', 'gif', 'tiff', 'webp']
let requestPaths = ['/resize', '/resize_width']

requestPaths.forEach(requestPath => {
  app.post(requestPath)
    .expect(400)
    .expect('Content-Type', /json/)
    .then(e => {
      console.info(requestPath + ' (empty) OK')
    }).catch(e => {
      console.error(e.message)
      console.error(requestPath + ' (empty) NG')
      process.exit(1)
    })

  exts.forEach(ext => {
    const filePath = path.join(dir, 'sample.' + ext)
    app.post(requestPath)
      .attach('file', filePath)
      .expect(200)
      .expect('Content-Type', /png/)
      .then(e => {
        console.info(requestPath + ' ' + ext + ' OK')
      }).catch(e => {
        console.error(e.message)
        console.error(requestPath + ' ' + ext + ' NG')
        process.exit(1)
      })
  });
});

exts = ['pdf', 'flv', 'mp4']
requestPaths = ['/convert']

requestPaths.forEach(requestPath => {
  app.post(requestPath)
    .expect(400)
    .expect('Content-Type', /json/)
    .then(e => {
      console.info(requestPath + ' (empty) OK')
    }).catch(e => {
      console.error(e.message)
      console.error(requestPath + ' (empty) NG')
      process.exit(1)
    })

  exts.forEach(ext => {
    const filePath = path.join(dir, 'sample.' + ext)
    app.post(requestPath)
      .attach('file', filePath)
      .expect(200)
      .expect('Content-Type', /png/)
      .then(e => {
        console.info(requestPath + ' ' + ext + ' OK')
      }).catch(e => {
        console.error(e.message)
        console.error(requestPath + ' ' + ext + ' NG')
        process.exit(1)
      })
  });
});
