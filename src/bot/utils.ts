import path from "node:path";
import fs from "node:fs";
import https from "node:https";

export const initializeTempDirectory = () => {
  const tempDir = path.join(process.cwd(), 'temp');
  
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
    console.log('📁 Created temp directory');
  } else {
    const oldFiles = fs.readdirSync(tempDir);
    oldFiles.forEach(file => fs.unlinkSync(path.join(tempDir, file)));
  }
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
