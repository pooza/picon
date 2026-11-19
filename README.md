# picon

画像・動画・文書を受け取り、PNG に変換して返す HTTP のサービス（Node.js / Express）。
PHP の CMS（minc3）が、サムネイルの作成や画像の縮小に呼ぶ。

## 概要

受け口は次の 4 つ。ファイルは `multipart/form-data` の `file` の項目で送る。
変換に成功すると、**PNG の本体**（`Content-Type: image/png`）を返す。

| 受け口 | 受けるもの | 引数（省略時の値） | すること |
| --- | --- | --- | --- |
| `POST /resize` | 画像 | `width`（100）・`height`（100）・`background_color`（`white`） | 縦横比を保って枠に収め、中央に置いて余白を背景色で埋める |
| `POST /resize_width` | 画像 | `width`（100）・`method`（`resize`） | 幅に合わせて縮める。`method` は `resize`・`thumbnail`・`sample`・`scale` のどれか |
| `POST /convert` | PDF・動画・Office の文書 | なし | 1 ページ目（動画は先頭のコマ）を PNG にする |
| `GET /about` | — | — | 版（`package.json` の中身）と、待ち受けの設定・一時ファイルの掃除の設定を JSON で返す |

- 画像として受ける形式は `config/default.yaml` の `image.types`（JPEG・PNG・GIF・WebP・BMP・TIFF・HEIC・HEIF・AVIF）。
  SVG など、ここに無い形式は受けない
- `/convert` が受ける形式は同じファイルの `video.types`・`office.types` と、PDF
- 失敗したときは JSON を返す。`error.status` が HTTP のステータスと同じ（ファイルが無い・形式が違う・変換に失敗した、は 400。
  無い受け口は 404）

```json
{"request": {"params": {}, "path": "/resize"}, "response": {}, "error": {"status": 400, "message": "Invalid file type"}}
```

- 変換の結果は `tmp/` に置き、`purge.cron` の間隔で `purge.days` 日より古いものを消す
- ログは 1 行ずつの JSON で、標準出力（エラーは標準エラー）に出す

## 動かすのに要るもの

- Node.js 20 以上（`package.json` の `engines`。CI は 20・22・24 で回している）
- yarn
- ImageMagick（画像の変換。PDF の変換には Ghostscript も要る）
- ffmpeg（動画の変換）
- LibreOffice（Office の文書の変換。`libreoffice` のコマンドで呼ぶ。文書を扱わないなら無くても起動はする）

待ち受けは `config/default.yaml` の `server`（既定は `127.0.0.1:3000`）。同じ機の CMS からだけ呼ぶ前提で、外には開けない。
設定を変えるときは `config/local.yaml` を置く（[node-config](https://github.com/node-config/node-config) が重ねて読む。
`config/` の中は `default.yaml` 以外を追跡しない）。

```yaml
config:
  server:
    port: 3001
```

## デプロイ

**1 台に 1 つ動かす。**CMS のサイトが複数あっても共用する（ポートがぶつかるので、複数は立てない）。
本番の機は FreeBSD。構成管理（pooza/chubo-minc・非公開）にはまだレシピが無く、以下は手で入れるときの手順。

1. 上の外部の道具と Node.js・yarn を入れる
2. 動かすアカウントのホームへ clone して、依存を入れる

   ```sh
   git clone https://github.com/pooza/picon.git
   cd picon
   yarn install
   ```

3. rc.d のスクリプト（`/usr/local/etc/rc.d/picon`）を置く。`picon.js` は常駐せず前で動くので、
   `cd <置き場> && sudo -u <アカウント> /usr/local/bin/node picon.js | logger -t picon &` で起動し、
   `pkill -f 'node picon.js'` で止める形にする（`LANG`・`LC_ALL` は `ja_JP.UTF-8`）。そのうえで有効にする

   ```sh
   sysrc picon_enable=YES picon_user=<アカウント> picon_path=<置き場>
   service picon start
   ```

4. ログを syslog で受ける。rsyslog の `rsyslog.d/picon.conf` に
   `:programname, isequal, "picon" -/var/log/picon.log` を、newsyslog の `newsyslog.conf.d/picon.conf` に
   `/var/log/picon.log 640 9 * @T00 ZB` を置く（⚠ newsyslog は名前が `.conf` で終わらないファイルを読まない）
5. monit で見張る。`monit.d/picon` に次を置く

   ```
   check process picon with matching "picon"
     start program = "/usr/sbin/service picon restart"
     stop program = "/usr/sbin/service picon stop"
   ```

6. 確かめる: `curl -s http://127.0.0.1:3000/about` で版が返ること

**更新**は、置き場で `git pull` → `yarn install` → `service picon restart`。

## 開発

```sh
yarn install
yarn start        # node picon.js
yarn test         # 別の端末で。起動中の picon に sample/ のファイルを送って確かめる
yarn lint         # Biome（biome.json）
yarn format       # Biome で整形
```

- `test.js` は、各受け口へ `sample/` の画像・PDF・動画を送り、200 と PNG が返ること、空の投稿・SVG・無い受け口が
  JSON のエラーになることを確かめる。picon を先に起動しておく
- CI（`.github/workflows/test.yml`）は push ごとに、Node 20・22・24 で ImageMagick と ffmpeg を入れ、lint とテストを回す。
  ubuntu-latest では PDF の変換が落ちるので、`ubuntu-24.04` に固定している（#187）

## ライセンス

MIT（`LICENSE.txt`）
