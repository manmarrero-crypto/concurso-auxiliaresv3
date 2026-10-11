const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'aspirantes.json');

function getAllAspirantes() {
  try {
    if (!fs.existsSync(FILE_PATH)) {
      fs.writeFileSync(FILE_PATH, '[]', 'utf8');
      return [];
    }
    const raw = fs.readFileSync(FILE_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error leyendo aspirantes.json:', err);
    return [];
  }
}

function saveAspirante(aspirante) {
  const list = getAllAspirantes();
  const id = aspirante.id || (aspirante.dni ? aspirante.dni.trim().toUpperCase() : 'asp_' + Date.now());
  aspirante.id = id;
  aspirante.updatedAt = new Date().toISOString();

  const existingIdx = list.findIndex(a => a.id === id);
  if (existingIdx >= 0) {
    list[existingIdx] = aspirante;
  } else {
    list.push(aspirante);
  }

  fs.writeFileSync(FILE_PATH, JSON.stringify(list, null, 2), 'utf8');
  return aspirante;
}

function deleteAspirante(id) {
  let list = getAllAspirantes();
  list = list.filter(a => a.id !== id);
  fs.writeFileSync(FILE_PATH, JSON.stringify(list, null, 2), 'utf8');
  return true;
}

module.exports = { getAllAspirantes, saveAspirante, deleteAspirante };
