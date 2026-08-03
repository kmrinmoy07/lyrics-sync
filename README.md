# Baahi Sync

A Next.js song browser and HLS audio player with timestamp-synchronized lyrics. The catalog is generated from `data/songs.xlsx`.

## Run locally

```bash
yarn install
yarn dev
```

Open [http://localhost:3000](http://localhost:3000).

## Update the song catalog

Replace `data/songs.xlsx` with a workbook that keeps the current columns, then run:

```bash
yarn import:songs
```

The importer also recognizes an optional `image_url` column. If no image is supplied, the interface creates a unique artwork tile for the song.

## Run in production with PM2

Install PM2 globally once on the server:

```bash
yarn global add pm2
```

For the first deployment, install dependencies, build, and start the app:

```bash
yarn && yarn build && pm2 start ecosystem.config.cjs
```

For later deployments:

```bash
yarn && yarn build && pm2 restart baahi-sync
```

Useful PM2 commands:

```bash
pm2 logs baahi-sync
pm2 status
pm2 stop baahi-sync
pm2 delete baahi-sync
```

The PM2 process is named `baahi-sync` and listens on port `3000` by default. Set `PORT` before starting it to use another port.
