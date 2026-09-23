// npm start/dev launch the same FastAPI application as python run.py.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const child = spawn(process.env.PYTHON || 'python', ['run.py'], {
  cwd: fileURLToPath(new URL('.', import.meta.url)),
  stdio: 'inherit',
  env: process.env
});
child.on('error', () => {
  console.error('Python not found. Activate .venv, install requirements.txt, then run python run.py.');
  process.exitCode = 1;
});
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
