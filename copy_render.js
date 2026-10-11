const fs = require('fs');
const path = require('path');

const dest = 'C:\\Users\\Educacion\\Desktop\\Concurso_Render_Backend';

if (fs.existsSync(dest)) {
  fs.rmSync(dest, { recursive: true, force: true });
}
fs.mkdirSync(dest, { recursive: true });

function copyRecursive(src, dst) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    fs.readdirSync(src).forEach(file => {
      copyRecursive(path.join(src, file), path.join(dst, file));
    });
  } else {
    fs.copyFileSync(src, dst);
  }
}

['package.json', 'server.js', '.gitignore'].forEach(f => {
  if (fs.existsSync(f)) {
    fs.copyFileSync(f, path.join(dest, f));
  }
});

['data', 'services', 'public'].forEach(d => {
  if (fs.existsSync(d)) {
    copyRecursive(d, path.join(dest, d));
  }
});

console.log('Archivos copiados en Concurso_Render_Backend con exito:');
fs.readdirSync(dest).forEach(f => console.log(' - ' + f));
