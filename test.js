'use strict'

const request = require('supertest')
const path = require('path')
const config = require('config').config
const app = request('http://localhost:' + config.server.port)
const entries = [
  {
    requestPaths: ['/resize', '/resize_width'],
    exts: ['jpg', 'png', 'gif', 'bmp', 'tiff', 'webp'],
  },
  {
    requestPaths: ['/convert'],
    exts: ['pdf', 'flv', 'mp4'],
  },
]

app.get('/notfound')
  .expect(404)
  .expect('Content-Type', /json/)
  .then(e => {
    console.info('OK /notfound')
  }).catch(e => {
    console.error(e.message)
    console.info('NG /notfound')
    process.exit(1)
  })

app.get('/about')
  .expect(200)
  .expect('Content-Type', /json/)
  .then(e => {
    console.info('OK /about')
  }).catch(e => {
    console.error(e.message)
    console.info('NG /about')
    process.exit(1)
  })

entries.forEach(entry => {
  entry.requestPaths.forEach(requestPath => {
    app.post(requestPath)
      .expect(400)
      .expect('Content-Type', /json/)
      .then(e => {
        console.info('OK (empty) ' + requestPath)
      }).catch(e => {
        console.error(e.message)
        console.error('NG (empty) ' + requestPath)
        process.exit(1)
      })

    entry.exts.forEach(ext => {
      const filePath = path.join(__dirname, 'sample/sample.' + ext)
      app.post(requestPath)
        .attach('file', filePath)
        .expect(200)
        .expect('Content-Type', /png/)
        .then(e => {
          console.info('OK .' + ext + ' ' + requestPath)
        }).catch(e => {
          console.error(e.message)
          console.info('NG .' + ext + ' ' + requestPath)
          process.exit(1)
        })
    });
  });
})
