const { execSync } = require('child_process');

function detectNvidia() {
  try {
    execSync('nvidia-smi', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const hasNvidia = detectNvidia();
if (hasNvidia) {
  console.log('GPU NVIDIA detectada. Modo CUDA habilitado.');
  process.exit(0);
}

console.log('GPU NVIDIA nao detectada. Aplicando fallback CPU.');
process.exit(0);
