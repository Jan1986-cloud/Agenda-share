import { spawn } from 'child_process';

const railwayToken = '93dc00b1-710c-4a37-baf6-1d6c2d599613';
const serviceId = 'c3735931-1fe9-4ce7-9084-03f65116cad8';

const command = 'railway';
const args = ['logs', '-s', serviceId];

const child = spawn(command, args, {
  env: {
    ...process.env,
    RAILWAY_TOKEN: railwayToken,
  },
  shell: true,
});

child.stdout.on('data', (data) => {
  console.log(`${data}`);
});

child.stderr.on('data', (data) => {
  console.error(`${data}`);
});

child.on('close', (code) => {
  console.log(`child process exited with code ${code}`);
});
