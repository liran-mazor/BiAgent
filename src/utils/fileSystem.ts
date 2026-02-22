import path from "node:path";
import fs from "node:fs";
import https from "node:https";

export const initializeTempDirectory = () => {
  const alfredTemp = path.join(process.cwd(), 'src/temp/alfred');
  const telegramTemp = path.join(process.cwd(), 'src/temp/telegram');

  [alfredTemp, telegramTemp].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`📁 Created ${dir}`);
    } else {
      fs.readdirSync(dir).forEach(file => fs.unlinkSync(path.join(dir, file)));
    }
  });
};

export const getLatestChart = async () => {
  const chartsDir = path.join(process.cwd(), 'charts');
  if (!fs.existsSync(chartsDir)) {
    return null;
  }
  const files = fs.readdirSync(chartsDir)
    .filter((f: string) => f.startsWith('chart_') && f.endsWith('.png'))
    .map((f: string) => ({
      name: f,
      time: fs.statSync(path.join(chartsDir, f)).mtime.getTime()
    }))
    .sort((a: any, b: any) => b.time - a.time);

  if (files.length > 0) {
    const mostRecent = files[0];
    const now = Date.now();
    if (now - mostRecent.time < 10000) {
      return path.join(chartsDir, mostRecent.name);
    }
  }
  return null;
};

export const downloadFile = async (fileUrl: string, localPath: string) => {
  await new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(localPath);
    https.get(fileUrl, (response: any) => {
      response.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve(localPath);
      });
    }).on('error', (err: any) => {
      fs.unlinkSync(localPath);
      reject(err);
    });
  });
};
