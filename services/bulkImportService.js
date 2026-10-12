const XLSX = require('xlsx');
const mammoth = require('mammoth');
const { PDFParse } = require('pdf-parse');
const { calculateScore } = require('./calculator');

/**
 * Normaliza un DNI/NIE: elimina espacios, guiones y convierte a mayúsculas
 */
function normalizarDni(str) {
  if (!str) return '';
  return String(str).replace(/[\s\-_]/g, '').trim().toUpperCase();
}

/**
 * Limpia y normaliza cadenas de texto
 */
function cleanText(str) {
  if (!str) return '';
  return String(str).replace(/\s+/g, ' ').trim();
}

/**
 * Busca de forma flexible el valor de una fila según varias palabras clave
 */
function getVal(row, keywords, defaultVal = '') {
  if (!row) return defaultVal;
  for (const kw of keywords) {
    const kwNorm = kw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (row[kwNorm] !== undefined && row[kwNorm] !== null && String(row[kwNorm]).trim() !== '') {
      return row[kwNorm];
    }
  }
  for (const [k, v] of Object.entries(row)) {
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      for (const kw of keywords) {
        const kwNorm = kw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        if (k.includes(kwNorm) || kwNorm.includes(k)) {
          return v;
        }
      }
    }
  }
  return defaultVal;
}

/**
 * Intenta localizar puestos del catálogo a partir de una cadena (códigos separados por coma, punto y coma, saltos de línea)
 */
function resolverPuestosSolicitados(strPuestos, puestosCatalogo = []) {
  if (!strPuestos) return [];
  
  let codigos = [];
  if (Array.isArray(strPuestos)) {
    codigos = strPuestos;
  } else {
    codigos = String(strPuestos)
      .split(/[,;\n\r/|]+/)
      .map(c => cleanText(c))
      .filter(c => c.length > 0);
  }

  const result = [];
  let orden = 1;

  for (const rawCod of codigos) {
    const codUpper = rawCod.toUpperCase();
    let match = puestosCatalogo.find(p => 
      (p.codigoRpt && p.codigoRpt.toUpperCase() === codUpper) ||
      (p.id && p.id.toUpperCase() === codUpper)
    );

    if (!match) {
      match = puestosCatalogo.find(p => 
        (p.codigoRpt && codUpper.includes(p.codigoRpt.toUpperCase())) ||
        (p.id && codUpper.includes(p.id.toUpperCase()))
      );
    }

    if (!match && rawCod.length > 4) {
      const lower = rawCod.toLowerCase();
      match = puestosCatalogo.find(p => 
        (p.tipo && p.tipo.toLowerCase().includes(lower)) ||
        (p.denominacionLarga && p.denominacionLarga.toLowerCase().includes(lower))
      );
    }

    if (match) {
      if (!result.some(r => (r.codigoRpt || r.id) === (match.codigoRpt || match.id))) {
        result.push({
          ...match,
          orden: orden++
        });
      }
    } else if (rawCod.length > 0) {
      result.push({
        id: codUpper,
        codigoRpt: codUpper,
        tipo: rawCod,
        formaProvision: 'Concurso ordinario',
        cd: 16,
        ce: 28,
        dotaciones: 1,
        consejeria: 'Cabildo Insular de Tenerife',
        entidad: 'Cabildo de Tenerife',
        servicio: 'Servicio General',
        localizacion: 'Santa Cruz de Tenerife',
        orden: orden++
      });
    }
  }

  return result;
}

// =============================================================================
// SECCIÓN 1: PARSERS DE CANDIDATOS Y SOLICITUDES (Puestos solicitados con orden)
// =============================================================================

/**
 * Extrae candidatos y solicitudes desde un archivo Excel (.xlsx, .xls, .csv)
 */
function parseExcelCandidatos(buffer, puestosCatalogo = []) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetNames = workbook.SheetNames;

  // Buscar hoja de aspirantes/solicitudes
  let hoja = sheetNames[0];
  for (const name of sheetNames) {
    const nLow = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (nLow.includes('aspirante') || nLow.includes('solicitud') || nLow.includes('participante') || nLow.includes('candidat')) {
      hoja = name;
      break;
    }
  }

  const sheet = workbook.Sheets[hoja];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  const candidatos = [];

  for (const r of rows) {
    const normRow = {};
    for (const [k, v] of Object.entries(r)) {
      normRow[k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()] = v;
    }

    const rawDni = getVal(normRow, ['dni', 'nif', 'nie', 'documento', 'identificacion']);
    const dni = normalizarDni(rawDni);
    if (!dni) continue;

    let nombre = cleanText(getVal(normRow, ['nombre y apellidos', 'apellidos y nombre']));
    if (!nombre) {
      const n = getVal(normRow, ['nombre']);
      const a = getVal(normRow, ['apellidos']);
      if (n && a) nombre = cleanText(`${n} ${a}`);
      else if (n) nombre = cleanText(n);
      else nombre = cleanText(getVal(normRow, ['participante', 'aspirante'], 'Aspirante ' + dni));
    }

    const rawSit = String(getVal(normRow, ['situacion administrativa', 'situacion', 'adscripcion'])).toLowerCase();
    const situacionAdministrativa = rawSit.includes('provis') ? 'provisional' : 'definitiva';
    const puestoOrigen = cleanText(getVal(normRow, ['puesto origen', 'puesto actual', 'destino actual', 'plaza origen']));
    const rawGrado = parseInt(getVal(normRow, ['grado personal', 'grado', 'nivel grado'], 16), 10);
    const gradoPersonal = String(isNaN(rawGrado) ? '16' : rawGrado);

    const rawHijos = String(getVal(normRow, ['conciliacion hijos', 'hijos', 'concil hijos'])).toLowerCase();
    const conciliacionHijos = rawHijos === 'si' || rawHijos === 'sí' || rawHijos === 'true' || rawHijos === '1' || parseInt(rawHijos, 10) > 0;

    const rawConyuge = String(getVal(normRow, ['conciliacion conyuge', 'conyuge', 'concil conyuge'])).toLowerCase();
    const conciliacionConyuge = rawConyuge === 'si' || rawConyuge === 'sí' || rawConyuge === 'true' || rawConyuge === '1';

    const rawPartRes = String(getVal(normRow, ['participa resultas', 'resultas'], 'si')).toLowerCase();
    const participaResultas = !(rawPartRes === 'no' || rawPartRes === 'false' || rawPartRes === '0');
    const soloResultas = String(getVal(normRow, ['solo resultas'])).toLowerCase() === 'si' || String(getVal(normRow, ['solo resultas'])) === '1';
    const renunciaResultas = String(getVal(normRow, ['renuncia resultas'])).toLowerCase() === 'si' || String(getVal(normRow, ['renuncia resultas'])) === '1';

    let puestosArray = [];
    const colPuestosUnicos = getVal(normRow, ['puestos solicitados', 'puestos pedidos', 'plazas solicitadas', 'puestos', 'plazas']);

    if (colPuestosUnicos) {
      puestosArray = resolverPuestosSolicitados(colPuestosUnicos, puestosCatalogo);
    } else {
      const puestosCols = [];
      for (let i = 1; i <= 20; i++) {
        const val = normRow[`puesto ${i}`] || normRow[`puesto${i}`] || normRow[`plaza ${i}`] || normRow[`opcion ${i}`];
        if (val) puestosCols.push(val);
      }
      if (puestosCols.length > 0) {
        puestosArray = resolverPuestosSolicitados(puestosCols, puestosCatalogo);
      }
    }

    if (puestosArray.length === 0 && puestosCatalogo.length > 0) {
      puestosArray = [{ ...puestosCatalogo[0], orden: 1 }];
    }

    const asp = {
      id: dni,
      dni,
      nombre,
      situacionAdministrativa,
      puestoOrigen,
      participaResultas,
      soloResultas,
      renunciaResultas,
      gradoPersonal,
      conciliacionHijos,
      conciliacionConyuge,
      antiguedadVinculadaDias: 0,
      antiguedadOtrasDias: 0,
      puestosSolicitados: puestosArray,
      puestoSolicitado: puestosArray[0] || (puestosCatalogo[0] || null),
      merits: {
        cursos: [],
        experiencia: [],
        titulaciones: [],
        idiomas: [],
        archivosProcesados: [{ archivo: hoja, tipoDocumentoEstimado: 'Listado Solicitudes Candidatos' }]
      }
    };

    if (asp.puestoSolicitado) {
      try {
        asp.resultadoCalculo = calculateScore(asp, asp.merits);
      } catch (e) {}
    }

    candidatos.push(asp);
  }

  return {
    tipo: 'candidatos',
    totalCandidatos: candidatos.length,
    candidatos
  };
}

/**
 * Extrae candidatos y solicitudes desde Word (.docx, .doc)
 */
async function parseWordCandidatos(buffer, puestosCatalogo = []) {
  const htmlResult = await mammoth.convertToHtml({ buffer });
  const rawResult = await mammoth.extractRawText({ buffer });
  const html = htmlResult.value || '';
  const text = rawResult.value || '';
  const candidatosMap = new Map();

  // Tablas en Word
  if (html.includes('<table')) {
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let tMatch;
    while ((tMatch = tableRegex.exec(html)) !== null) {
      const rowsHtml = tMatch[1];
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let rMatch;
      const rows = [];
      while ((rMatch = rowRegex.exec(rowsHtml)) !== null) {
        const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
        let cMatch;
        const cells = [];
        while ((cMatch = cellRegex.exec(rMatch[1])) !== null) {
          cells.push(cMatch[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim());
        }
        if (cells.length > 0) rows.push(cells);
      }

      if (rows.length < 2) continue;
      const header = rows[0].map(c => c.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim());
      const colDni = header.findIndex(c => c.includes('dni') || c.includes('nif') || c.includes('documento'));
      const colNom = header.findIndex(c => c.includes('nombre') || c.includes('apellidos') || c.includes('aspirante'));
      const colPuestos = header.findIndex(c => c.includes('puesto') || c.includes('plaza') || c.includes('solicitud'));

      if (colDni >= 0) {
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const dni = normalizarDni(row[colDni]);
          if (!dni) continue;

          const nombre = colNom >= 0 && row[colNom] ? cleanText(row[colNom]) : 'Aspirante ' + dni;
          const puestosStr = colPuestos >= 0 && row[colPuestos] ? row[colPuestos] : '';
          const puestos = resolverPuestosSolicitados(puestosStr, puestosCatalogo);

          candidatosMap.set(dni, {
            id: dni,
            dni,
            nombre,
            situacionAdministrativa: 'definitiva',
            puestoOrigen: '',
            participaResultas: true,
            soloResultas: false,
            renunciaResultas: false,
            gradoPersonal: '16',
            conciliacionHijos: false,
            conciliacionConyuge: false,
            antiguedadVinculadaDias: 0,
            antiguedadOtrasDias: 0,
            puestosSolicitados: puestos.length > 0 ? puestos : (puestosCatalogo.length > 0 ? [{ ...puestosCatalogo[0], orden: 1 }] : []),
            puestoSolicitado: puestos[0] || (puestosCatalogo[0] || null),
            merits: { cursos: [], experiencia: [], titulaciones: [], idiomas: [], archivosProcesados: [] }
          });
        }
      }
    }
  }

  // Texto plano si no había tablas
  if (candidatosMap.size === 0 && text) {
    const dniRegex = /\b([0-9]{8}[A-Z]|[XYZ][0-9]{7}[A-Z])\b/gi;
    const lines = text.split('\n');
    for (const line of lines) {
      const matchDni = line.match(dniRegex);
      if (matchDni) {
        const dni = normalizarDni(matchDni[0]);
        if (!candidatosMap.has(dni)) {
          let nombre = line.replace(dniRegex, '').replace(/[-–—,;:]+/g, ' ').trim();
          if (nombre.length > 50) nombre = nombre.substring(0, 50);
          if (!nombre) nombre = 'Aspirante ' + dni;

          const fcMatch = line.match(/FC[0-9]{2,4}/gi);
          const puestos = fcMatch ? resolverPuestosSolicitados(fcMatch.join(','), puestosCatalogo) : [];

          candidatosMap.set(dni, {
            id: dni,
            dni,
            nombre: cleanText(nombre),
            situacionAdministrativa: 'definitiva',
            puestoOrigen: '',
            participaResultas: true,
            soloResultas: false,
            renunciaResultas: false,
            gradoPersonal: '16',
            conciliacionHijos: false,
            conciliacionConyuge: false,
            antiguedadVinculadaDias: 0,
            antiguedadOtrasDias: 0,
            puestosSolicitados: puestos.length > 0 ? puestos : (puestosCatalogo.length > 0 ? [{ ...puestosCatalogo[0], orden: 1 }] : []),
            puestoSolicitado: puestos[0] || (puestosCatalogo[0] || null),
            merits: { cursos: [], experiencia: [], titulaciones: [], idiomas: [], archivosProcesados: [] }
          });
        }
      }
    }
  }

  for (const asp of candidatosMap.values()) {
    if (asp.puestoSolicitado) {
      try {
        asp.resultadoCalculo = calculateScore(asp, asp.merits);
      } catch (e) {}
    }
  }

  return {
    tipo: 'candidatos',
    totalCandidatos: candidatosMap.size,
    candidatos: Array.from(candidatosMap.values())
  };
}

/**
 * Extrae candidatos y solicitudes desde PDF (.pdf)
 */
async function parsePdfCandidatos(buffer, puestosCatalogo = []) {
  const parser = new PDFParse({ data: buffer });
  const data = await parser.getText();
  const text = data.text || '';
  const candidatosMap = new Map();
  const dniRegex = /\b([0-9]{8}[A-Z]|[XYZ][0-9]{7}[A-Z])\b/gi;
  const lines = text.split('\n').map(l => cleanText(l)).filter(l => l.length > 0);

  for (const line of lines) {
    const matchDni = line.match(dniRegex);
    if (matchDni) {
      const dni = normalizarDni(matchDni[0]);
      if (!candidatosMap.has(dni)) {
        let resto = line.replace(dniRegex, '').replace(/[-–—,;:|]+/g, ' ').trim();
        const fcMatches = line.match(/FC[0-9]{2,4}/gi);
        let puestos = [];
        if (fcMatches) {
          puestos = resolverPuestosSolicitados(fcMatches.join(','), puestosCatalogo);
          resto = resto.replace(/FC[0-9]{2,4}/gi, '').trim();
        }

        let nombre = cleanText(resto);
        if (nombre.length > 50) nombre = nombre.substring(0, 50);
        if (!nombre || nombre.length < 3) nombre = 'Aspirante ' + dni;

        candidatosMap.set(dni, {
          id: dni,
          dni,
          nombre,
          situacionAdministrativa: 'definitiva',
          puestoOrigen: '',
          participaResultas: true,
          soloResultas: false,
          renunciaResultas: false,
          gradoPersonal: '16',
          conciliacionHijos: false,
          conciliacionConyuge: false,
          antiguedadVinculadaDias: 0,
          antiguedadOtrasDias: 0,
          puestosSolicitados: puestos.length > 0 ? puestos : (puestosCatalogo.length > 0 ? [{ ...puestosCatalogo[0], orden: 1 }] : []),
          puestoSolicitado: puestos[0] || (puestosCatalogo[0] || null),
          merits: { cursos: [], experiencia: [], titulaciones: [], idiomas: [], archivosProcesados: [] }
        });
      }
    }
  }

  for (const asp of candidatosMap.values()) {
    if (asp.puestoSolicitado) {
      try {
        asp.resultadoCalculo = calculateScore(asp, asp.merits);
      } catch (e) {}
    }
  }

  return {
    tipo: 'candidatos',
    totalCandidatos: candidatosMap.size,
    candidatos: Array.from(candidatosMap.values())
  };
}

// =============================================================================
// SECCIÓN 2: PARSERS DE MÉRITOS DE OFICIO (Formación y Tiempo Trabajado en Cabildo)
// =============================================================================

/**
 * Extrae formación y experiencia de oficio agrupados por DNI desde Excel (.xlsx, .xls, .csv)
 */
function parseExcelMeritos(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetNames = workbook.SheetNames;

  const meritosPorDni = {}; // DNI -> { dni, nombreAspirante, cursos: [], experiencia: [] }
  let totalCursos = 0;
  let totalServicios = 0;

  for (const name of sheetNames) {
    const nLow = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    if (!rows || rows.length === 0) continue;

    const isHojaCursos = nLow.includes('curso') || nLow.includes('formacion');
    const isHojaExp = nLow.includes('experiencia') || nLow.includes('servicio') || nLow.includes('tiempo') || nLow.includes('antiguedad');

    for (const r of rows) {
      const normRow = {};
      for (const [k, v] of Object.entries(r)) {
        normRow[k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()] = v;
      }

      const rawDni = getVal(normRow, ['dni', 'nif', 'nie', 'documento', 'aspirante', 'participante']);
      const dni = normalizarDni(rawDni);
      if (!dni) continue;

      if (!meritosPorDni[dni]) {
        const nom = cleanText(getVal(normRow, ['nombre aspirante', 'nombre', 'participante', 'aspirante']));
        meritosPorDni[dni] = {
          dni,
          nombreAspirante: nom,
          cursos: [],
          experiencia: []
        };
      }

      // 1. Extraer curso si procede
      const tituloCurso = cleanText(getVal(normRow, ['titulo del curso', 'curso', 'titulo', 'denominacion', 'actividad']));
      const horas = parseFloat(getVal(normRow, ['horas', 'duracion', 'creditos'], 0)) || 0;
      if (tituloCurso && horas > 0) {
        const rawTipo = String(getVal(normRow, ['tipo', 'modalidad'], 'Aprovechamiento')).toLowerCase();
        const tipo = rawTipo.includes('asist') ? 'Asistencia' : 'Aprovechamiento';
        const rawCar = String(getVal(normRow, ['caracter', 'materia', 'tipo materia'], 'Específico')).toLowerCase();
        const esEsp = rawCar.includes('espec') || (!rawCar.includes('general') && !rawCar.includes('transversal'));
        const caracter = esEsp ? 'Específico' : 'General / Transversal';

        meritosPorDni[dni].cursos.push({
          titulo: tituloCurso,
          horas,
          tipo,
          caracter,
          esEspecifico: esEsp,
          incluido: true,
          origenArchivo: `Excel (${name})`
        });
        totalCursos++;
      }

      // 2. Extraer experiencia si procede
      let dias = parseInt(getVal(normRow, ['dias', 'dias trabajados', 'tiempo'], 0), 10) || 0;
      const fIni = getVal(normRow, ['fecha inicio', 'inicio', 'desde']);
      const fFin = getVal(normRow, ['fecha fin', 'fin', 'hasta']);
      if (dias <= 0 && fIni && fFin) {
        const dIni = new Date(fIni);
        const dFin = new Date(fFin);
        if (!isNaN(dIni.getTime()) && !isNaN(dFin.getTime())) {
          dias = Math.max(1, Math.round((dFin - dIni) / (1000 * 60 * 60 * 24)) + 1);
        }
      }

      const puesto = cleanText(getVal(normRow, ['puesto', 'categoria', 'cuerpo', 'puesto o categoria']));
      if (dias > 0 || (isHojaExp && puesto)) {
        const administracion = cleanText(getVal(normRow, ['administracion', 'entidad', 'organismo'], 'Cabildo de Tenerife'));
        const cd = parseInt(getVal(normRow, ['cd', 'nivel', 'nivel cd', 'cd nivel'], 16), 10) || 16;
        const rawAmbito = String(getVal(normRow, ['ambito', 'especifica ambito', 'especifica'])).toLowerCase();
        const esEspecificaAmbito = rawAmbito === 'si' || rawAmbito === 'sí' || rawAmbito === 'true' || rawAmbito === '1';

        meritosPorDni[dni].experiencia.push({
          puesto: puesto || 'Auxiliar Administrativo/a',
          administracion,
          cd,
          dias: dias > 0 ? dias : 365,
          tipoPlaza: administracion.toLowerCase().includes('cabildo') || administracion.toLowerCase().includes('iass') ? 'vinculada' : 'otra',
          esEspecificaAmbito,
          origenArchivo: `Excel (${name})`
        });
        totalServicios++;
      }
    }
  }

  return {
    tipo: 'meritos',
    totalAspirantes: Object.keys(meritosPorDni).length,
    totalCursos,
    totalServicios,
    meritosPorDni
  };
}

/**
 * Extrae formación y experiencia de oficio agrupados por DNI desde Word (.docx, .doc)
 */
async function parseWordMeritos(buffer) {
  const htmlResult = await mammoth.convertToHtml({ buffer });
  const rawResult = await mammoth.extractRawText({ buffer });
  const html = htmlResult.value || '';
  const text = rawResult.value || '';
  const meritosPorDni = {};
  let totalCursos = 0;
  let totalServicios = 0;

  if (html.includes('<table')) {
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let tMatch;
    while ((tMatch = tableRegex.exec(html)) !== null) {
      const rowsHtml = tMatch[1];
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let rMatch;
      const rows = [];
      while ((rMatch = rowRegex.exec(rowsHtml)) !== null) {
        const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
        let cMatch;
        const cells = [];
        while ((cMatch = cellRegex.exec(rMatch[1])) !== null) {
          cells.push(cMatch[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim());
        }
        if (cells.length > 0) rows.push(cells);
      }

      if (rows.length < 2) continue;
      const header = rows[0].map(c => c.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim());
      const colDni = header.findIndex(c => c.includes('dni') || c.includes('nif') || c.includes('documento'));
      const colNom = header.findIndex(c => c.includes('nombre') || c.includes('apellidos') || c.includes('aspirante'));
      const colCurso = header.findIndex(c => c.includes('curso') || c.includes('formacion') || c.includes('denominacion') || c.includes('titulo'));
      const colHoras = header.findIndex(c => c.includes('horas') || c.includes('duracion'));
      const colDias = header.findIndex(c => c.includes('dias') || c.includes('tiempo') || c.includes('antiguedad'));
      const colPuesto = header.findIndex(c => c.includes('puesto') || c.includes('categoria') || c.includes('cuerpo'));

      if (colDni >= 0) {
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const dni = normalizarDni(row[colDni]);
          if (!dni) continue;

          if (!meritosPorDni[dni]) {
            const nom = colNom >= 0 && row[colNom] ? cleanText(row[colNom]) : '';
            meritosPorDni[dni] = { dni, nombreAspirante: nom, cursos: [], experiencia: [] };
          }

          if (colCurso >= 0 && row[colCurso] && colHoras >= 0 && row[colHoras]) {
            const h = parseFloat(row[colHoras]) || 0;
            if (h > 0) {
              meritosPorDni[dni].cursos.push({
                titulo: cleanText(row[colCurso]),
                horas: h,
                tipo: 'Aprovechamiento',
                caracter: 'Específico',
                esEspecifico: true,
                incluido: true,
                origenArchivo: 'Word (De Oficio)'
              });
              totalCursos++;
            }
          }

          if (colDias >= 0 && row[colDias]) {
            const d = parseInt(row[colDias], 10) || 0;
            if (d > 0) {
              const p = colPuesto >= 0 && row[colPuesto] ? cleanText(row[colPuesto]) : 'Auxiliar Administrativo/a';
              meritosPorDni[dni].experiencia.push({
                puesto: p,
                administracion: 'Cabildo de Tenerife',
                cd: 16,
                dias: d,
                tipoPlaza: 'vinculada',
                esEspecificaAmbito: false,
                origenArchivo: 'Word (De Oficio)'
              });
              totalServicios++;
            }
          }
        }
      }
    }
  }

  return {
    tipo: 'meritos',
    totalAspirantes: Object.keys(meritosPorDni).length,
    totalCursos,
    totalServicios,
    meritosPorDni
  };
}

/**
 * Extrae formación y experiencia de oficio agrupados por DNI desde PDF (.pdf)
 */
async function parsePdfMeritos(buffer) {
  const parser = new PDFParse({ data: buffer });
  const data = await parser.getText();
  const text = data.text || '';
  const meritosPorDni = {};
  const dniRegex = /\b([0-9]{8}[A-Z]|[XYZ][0-9]{7}[A-Z])\b/gi;
  const lines = text.split('\n').map(l => cleanText(l)).filter(l => l.length > 0);
  let totalCursos = 0;
  let totalServicios = 0;

  for (const line of lines) {
    const matchDni = line.match(dniRegex);
    if (matchDni) {
      const dni = normalizarDni(matchDni[0]);
      if (!meritosPorDni[dni]) {
        meritosPorDni[dni] = { dni, nombreAspirante: '', cursos: [], experiencia: [] };
      }

      // Buscar horas (ej: 100 horas)
      const horasMatch = line.match(/(\d+)\s*horas?/i);
      if (horasMatch) {
        const h = parseFloat(horasMatch[1]) || 0;
        let t = line.replace(dniRegex, '').replace(horasMatch[0], '').replace(/[-–—,;:|]+/g, ' ').trim();
        if (h > 0) {
          meritosPorDni[dni].cursos.push({
            titulo: t || 'Curso certificado de formación',
            horas: h,
            tipo: 'Aprovechamiento',
            caracter: 'Específico',
            esEspecifico: true,
            incluido: true,
            origenArchivo: 'PDF (De Oficio)'
          });
          totalCursos++;
        }
      }

      // Buscar días (ej: 365 días)
      const diasMatch = line.match(/(\d+)\s*d[ií]as/i);
      if (diasMatch) {
        const d = parseInt(diasMatch[1], 10) || 0;
        if (d > 0) {
          meritosPorDni[dni].experiencia.push({
            puesto: 'Auxiliar Administrativo/a',
            administracion: 'Cabildo de Tenerife',
            cd: 16,
            dias: d,
            tipoPlaza: 'vinculada',
            esEspecificaAmbito: false,
            origenArchivo: 'PDF (De Oficio)'
          });
          totalServicios++;
        }
      }
    }
  }

  return {
    tipo: 'meritos',
    totalAspirantes: Object.keys(meritosPorDni).length,
    totalCursos,
    totalServicios,
    meritosPorDni
  };
}

// =============================================================================
// SECCIÓN 3: COMPARATIVAS PORMENORIZADAS (DIFFS) Y FUSIONES
// =============================================================================

/**
 * Genera comparativa pormenorizada de datos personales y puestos solicitados entre candidato existente y nuevo
 */
function generateCandidateDiff(existente, nuevo) {
  const cambios = [];

  if (nuevo.nombre && existente.nombre && nuevo.nombre.trim() !== existente.nombre.trim()) {
    cambios.push({
      campo: 'Nombre y Apellidos',
      anterior: existente.nombre,
      nuevo: nuevo.nombre,
      tipo: 'modificado'
    });
  }

  if (nuevo.situacionAdministrativa && nuevo.situacionAdministrativa !== existente.situacionAdministrativa) {
    cambios.push({
      campo: 'Situación Administrativa',
      anterior: existente.situacionAdministrativa || 'definitiva',
      nuevo: nuevo.situacionAdministrativa,
      tipo: 'modificado'
    });
  }

  if (nuevo.puestoOrigen && nuevo.puestoOrigen !== existente.puestoOrigen) {
    cambios.push({
      campo: 'Puesto de Origen',
      anterior: existente.puestoOrigen || '(Sin especificar)',
      nuevo: nuevo.puestoOrigen,
      tipo: 'modificado'
    });
  }

  if (nuevo.gradoPersonal && String(nuevo.gradoPersonal) !== String(existente.gradoPersonal)) {
    cambios.push({
      campo: 'Grado Personal Reconocido',
      anterior: String(existente.gradoPersonal || '16'),
      nuevo: String(nuevo.gradoPersonal),
      tipo: 'modificado'
    });
  }

  if (nuevo.conciliacionHijos !== undefined && nuevo.conciliacionHijos !== existente.conciliacionHijos) {
    cambios.push({
      campo: 'Conciliación por Hijos',
      anterior: existente.conciliacionHijos ? 'Sí' : 'No',
      nuevo: nuevo.conciliacionHijos ? 'Sí' : 'No',
      tipo: 'modificado'
    });
  }

  if (nuevo.conciliacionConyuge !== undefined && nuevo.conciliacionConyuge !== existente.conciliacionConyuge) {
    cambios.push({
      campo: 'Conciliación por Cónyuge',
      anterior: existente.conciliacionConyuge ? 'Sí' : 'No',
      nuevo: nuevo.conciliacionConyuge ? 'Sí' : 'No',
      tipo: 'modificado'
    });
  }

  const puestosAnt = (existente.puestosSolicitados || []).map(p => `${p.codigoRpt || p.id} (${p.orden}º)`).join(', ');
  const puestosNuev = (nuevo.puestosSolicitados || []).map(p => `${p.codigoRpt || p.id} (${p.orden}º)`).join(', ');
  if (puestosNuev && puestosNuev !== puestosAnt) {
    cambios.push({
      campo: 'Puestos Solicitados (Preferencia)',
      anterior: puestosAnt || '(Ninguno)',
      nuevo: puestosNuev,
      tipo: 'modificado'
    });
  }

  return {
    dni: existente.dni,
    nombre: existente.nombre,
    hasConflicts: cambios.length > 0,
    totalCambios: cambios.length,
    cambios
  };
}

/**
 * Genera comparativa pormenorizada de méritos de oficio (Formación y Tiempo Cabildo)
 */
function generateMeritsDiff(existente, datosMeritos) {
  const cambios = [];
  const cursosAnt = existente.merits?.cursos || [];
  const cursosNuevos = datosMeritos.cursos || [];

  // Cursos que realmente no estaban ya registrados
  const cursosParaAnadir = cursosNuevos.filter(cn => 
    !cursosAnt.some(ca => cleanText(ca.titulo).toLowerCase() === cleanText(cn.titulo).toLowerCase() && parseFloat(ca.horas) === parseFloat(cn.horas))
  );

  const horasNuevas = cursosParaAnadir.reduce((acc, c) => acc + (parseFloat(c.horas) || 0), 0);
  if (cursosParaAnadir.length > 0) {
    cambios.push({
      campo: 'Cursos de Formación (De Oficio)',
      anterior: `${cursosAnt.length} curso(s) registrado(s)`,
      nuevo: `+${cursosParaAnadir.length} curso(s) nuevo(s) (+${horasNuevas} horas)`,
      detalleItems: cursosParaAnadir.map(c => `• ${c.titulo} (${c.horas}h - ${c.caracter})`),
      tipo: 'anadido'
    });
  }

  // Experiencia / Servicios en Cabildo
  const expAnt = existente.merits?.experiencia || [];
  const expNuevas = datosMeritos.experiencia || [];
  const expParaAnadir = expNuevas.filter(en => 
    !expAnt.some(ea => cleanText(ea.puesto).toLowerCase() === cleanText(en.puesto).toLowerCase() && parseInt(ea.dias, 10) === parseInt(en.dias, 10))
  );

  const diasNuevos = expParaAnadir.reduce((acc, e) => acc + (parseInt(e.dias, 10) || 0), 0);
  if (expParaAnadir.length > 0) {
    const dAntVin = existente.antiguedadVinculadaDias || 0;
    cambios.push({
      campo: 'Servicios Prestados Cabildo (De Oficio)',
      anterior: `${dAntVin} días registrados (${expAnt.length} período(s))`,
      nuevo: `+${expParaAnadir.length} período(s) nuevo(s) (+${diasNuevos} días)`,
      detalleItems: expParaAnadir.map(e => `• ${e.puesto} - ${e.administracion} (${e.dias} días - CD ${e.cd || 16})`),
      tipo: 'incrementado'
    });
  }

  return {
    dni: existente.dni,
    nombre: existente.nombre,
    hasConflicts: cambios.length > 0,
    totalCambios: cambios.length,
    cambios,
    cursosParaAnadir,
    expParaAnadir,
    horasNuevas,
    diasNuevos
  };
}

/**
 * Actualiza la solicitud de un aspirante conservando intactos sus méritos
 */
function mergeCandidateSolicitud(existente, nuevo) {
  const actualizado = JSON.parse(JSON.stringify(existente));
  if (nuevo.nombre) actualizado.nombre = nuevo.nombre;
  if (nuevo.situacionAdministrativa) actualizado.situacionAdministrativa = nuevo.situacionAdministrativa;
  if (nuevo.puestoOrigen) actualizado.puestoOrigen = nuevo.puestoOrigen;
  if (nuevo.gradoPersonal) actualizado.gradoPersonal = String(nuevo.gradoPersonal);
  if (nuevo.conciliacionHijos !== undefined) actualizado.conciliacionHijos = nuevo.conciliacionHijos;
  if (nuevo.conciliacionConyuge !== undefined) actualizado.conciliacionConyuge = nuevo.conciliacionConyuge;
  if (nuevo.puestosSolicitados && nuevo.puestosSolicitados.length > 0) {
    actualizado.puestosSolicitados = nuevo.puestosSolicitados;
    actualizado.puestoSolicitado = nuevo.puestosSolicitados[0];
  }

  if (actualizado.puestoSolicitado) {
    try {
      actualizado.resultadoCalculo = calculateScore(actualizado, actualizado.merits || {});
    } catch (e) {}
  }

  return actualizado;
}

/**
 * Fusiona e incorpora méritos de oficio a un aspirante existente sin borrar los previos
 */
function mergeMeritsDeOficio(existente, datosMeritos) {
  const merged = JSON.parse(JSON.stringify(existente));
  if (!merged.merits) merged.merits = { cursos: [], experiencia: [], titulaciones: [], idiomas: [], archivosProcesados: [] };
  if (!Array.isArray(merged.merits.cursos)) merged.merits.cursos = [];
  if (!Array.isArray(merged.merits.experiencia)) merged.merits.experiencia = [];
  if (!Array.isArray(merged.merits.archivosProcesados)) merged.merits.archivosProcesados = [];

  // 1. Añadir cursos
  for (const nc of (datosMeritos.cursos || [])) {
    const yaExiste = merged.merits.cursos.some(c => 
      cleanText(c.titulo).toLowerCase() === cleanText(nc.titulo).toLowerCase() &&
      parseFloat(c.horas) === parseFloat(nc.horas)
    );
    if (!yaExiste) {
      merged.merits.cursos.push(nc);
    }
  }

  // 2. Añadir experiencia
  for (const ne of (datosMeritos.experiencia || [])) {
    const yaExiste = merged.merits.experiencia.some(e => 
      cleanText(e.puesto).toLowerCase() === cleanText(ne.puesto).toLowerCase() &&
      parseInt(e.dias, 10) === parseInt(ne.dias, 10)
    );
    if (!yaExiste) {
      merged.merits.experiencia.push(ne);
    }
  }

  // 3. Recalcular días de Cabildo y otras AAPP
  let totalVin = 0;
  let totalOtr = 0;
  for (const exp of merged.merits.experiencia) {
    const d = parseInt(exp.dias, 10) || 0;
    if (exp.tipoPlaza === 'otra') {
      totalOtr += d;
    } else {
      totalVin += d;
    }
  }

  merged.antiguedadVinculadaDias = Math.max(merged.antiguedadVinculadaDias || 0, totalVin);
  merged.antiguedadOtrasDias = Math.max(merged.antiguedadOtrasDias || 0, totalOtr);

  merged.merits.archivosProcesados.push({
    archivo: 'Suministro Méritos de Oficio',
    tipoDocumentoEstimado: 'Actualización De Oficio (Cursos y Servicios)',
    fecha: new Date().toISOString()
  });

  if (merged.puestoSolicitado) {
    try {
      merged.resultadoCalculo = calculateScore(merged, merged.merits);
    } catch (e) {}
  }

  return merged;
}

/**
 * Sobrescribe por completo los méritos de un aspirante por los méritos de oficio
 */
function overwriteMeritsDeOficio(existente, datosMeritos) {
  const overwritten = JSON.parse(JSON.stringify(existente));
  if (!overwritten.merits) overwritten.merits = { cursos: [], experiencia: [], titulaciones: [], idiomas: [], archivosProcesados: [] };
  
  overwritten.merits.cursos = datosMeritos.cursos || [];
  overwritten.merits.experiencia = datosMeritos.experiencia || [];

  let totalVin = 0;
  let totalOtr = 0;
  for (const exp of overwritten.merits.experiencia) {
    const d = parseInt(exp.dias, 10) || 0;
    if (exp.tipoPlaza === 'otra') {
      totalOtr += d;
    } else {
      totalVin += d;
    }
  }

  overwritten.antiguedadVinculadaDias = totalVin;
  overwritten.antiguedadOtrasDias = totalOtr;

  if (overwritten.puestoSolicitado) {
    try {
      overwritten.resultadoCalculo = calculateScore(overwritten, overwritten.merits);
    } catch (e) {}
  }

  return overwritten;
}

// Mantener función legacy de compatibilidad
function mergeAspiranteDeOficio(existente, nuevo) {
  const meritos = {
    cursos: nuevo.merits?.cursos || nuevo.cursosOficio || [],
    experiencia: nuevo.merits?.experiencia || nuevo.serviciosOficio || []
  };
  return mergeMeritsDeOficio(existente, meritos);
}

// =============================================================================
// SECCIÓN 4: GENERADORES DE PLANTILLAS EXCEL ESPECÍFICAS
// =============================================================================

/**
 * Genera la plantilla Excel específica para CANDIDATOS Y SOLICITUDES
 */
function generateTemplateCandidatos(puestosCatalogo = []) {
  const wb = XLSX.utils.book_new();

  // Hoja 1: Aspirantes y Solicitudes
  const sampleAspirantes = [
    {
      'DNI': '12345678A',
      'Nombre y Apellidos': 'Marrero Pérez, Carmen Rosa',
      'Situacion Administrativa (definitiva/provisional)': 'definitiva',
      'Puesto Origen': 'FC1843 - Auxiliar Adm. Proyectos',
      'Puestos Solicitados (Codigos RPT separados por coma en orden de preferencia)': 'FC1843, FC1897, FC11',
      'Grado Personal': 16,
      'Conciliacion Hijos (Si/No)': 'Si',
      'Conciliacion Conyuge (Si/No)': 'No',
      'Participa Resultas (Si/No)': 'Si'
    },
    {
      'DNI': '87654321B',
      'Nombre y Apellidos': 'González Hernández, Francisco Javier',
      'Situacion Administrativa (definitiva/provisional)': 'provisional',
      'Puesto Origen': 'Adscripción provisional Cabildo',
      'Puestos Solicitados (Codigos RPT separados por coma en orden de preferencia)': 'FC1897, FC1808',
      'Grado Personal': 14,
      'Conciliacion Hijos (Si/No)': 'No',
      'Conciliacion Conyuge (Si/No)': 'Si',
      'Participa Resultas (Si/No)': 'Si'
    },
    {
      'DNI': '45678901C',
      'Nombre y Apellidos': 'Rodríguez Cabrera, Beatriz',
      'Situacion Administrativa (definitiva/provisional)': 'definitiva',
      'Puesto Origen': 'FC1897 - Gestor de Contenidos',
      'Puestos Solicitados (Codigos RPT separados por coma en orden de preferencia)': 'FC11, FC1843',
      'Grado Personal': 18,
      'Conciliacion Hijos (Si/No)': 'No',
      'Conciliacion Conyuge (Si/No)': 'No',
      'Participa Resultas (Si/No)': 'No'
    }
  ];
  const wsAspirantes = XLSX.utils.json_to_sheet(sampleAspirantes);
  wsAspirantes['!cols'] = [
    { wch: 14 }, { wch: 38 }, { wch: 26 }, { wch: 32 }, { wch: 48 },
    { wch: 15 }, { wch: 22 }, { wch: 24 }, { wch: 22 }
  ];
  XLSX.utils.book_append_sheet(wb, wsAspirantes, 'Aspirantes y Solicitudes');

  // Hoja 2: Catálogo de Puestos (Referencia)
  const rowsCatalogo = (puestosCatalogo || []).map(p => ({
    'Codigo RPT': p.codigoRpt || p.id,
    'Tipo de Puesto': p.tipo,
    'Forma Provision': p.formaProvision,
    'Nivel CD': p.cd,
    'Nivel CE': p.ce || '-',
    'Dotaciones': p.dotaciones || 1,
    'Servicio': p.servicio || '',
    'Localizacion': p.localizacion || ''
  }));
  const wsCat = XLSX.utils.json_to_sheet(rowsCatalogo);
  wsCat['!cols'] = [
    { wch: 14 }, { wch: 38 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 45 }, { wch: 35 }
  ];
  XLSX.utils.book_append_sheet(wb, wsCat, 'Catalogo Puestos (Referencia)');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Genera la plantilla Excel específica para MÉRITOS DE OFICIO (Formación y Servicios Cabildo)
 */
function generateTemplateMeritos() {
  const wb = XLSX.utils.book_new();

  // Hoja 1: Formación (De Oficio)
  const sampleCursos = [
    {
      'DNI Aspirante': '12345678A',
      'Nombre Aspirante': 'Marrero Pérez, Carmen Rosa',
      'Titulo del Curso': 'Gestión Administrativa y Expedientes Electrónicos (SIGEC)',
      'Horas': 120,
      'Tipo (Aprovechamiento/Asistencia)': 'Aprovechamiento',
      'Caracter (Especifico/General)': 'Específico'
    },
    {
      'DNI Aspirante': '12345678A',
      'Nombre Aspirante': 'Marrero Pérez, Carmen Rosa',
      'Titulo del Curso': 'Procedimiento Administrativo Común Ley 39/2015',
      'Horas': 80,
      'Tipo (Aprovechamiento/Asistencia)': 'Aprovechamiento',
      'Caracter (Especifico/General)': 'Específico'
    },
    {
      'DNI Aspirante': '87654321B',
      'Nombre Aspirante': 'González Hernández, Francisco Javier',
      'Titulo del Curso': 'Atención a la Ciudadanía y Canales Digitales',
      'Horas': 100,
      'Tipo (Aprovechamiento/Asistencia)': 'Aprovechamiento',
      'Caracter (Especifico/General)': 'Específico'
    },
    {
      'DNI Aspirante': '87654321B',
      'Nombre Aspirante': 'González Hernández, Francisco Javier',
      'Titulo del Curso': 'Igualdad de Género y Diversidad en la Administración',
      'Horas': 50,
      'Tipo (Aprovechamiento/Asistencia)': 'Aprovechamiento',
      'Caracter (Especifico/General)': 'General'
    }
  ];
  const wsCursos = XLSX.utils.json_to_sheet(sampleCursos);
  wsCursos['!cols'] = [
    { wch: 15 }, { wch: 35 }, { wch: 55 }, { wch: 10 }, { wch: 30 }, { wch: 28 }
  ];
  XLSX.utils.book_append_sheet(wb, wsCursos, 'Formacion (De Oficio)');

  // Hoja 2: Servicios Cabildo (De Oficio)
  const sampleServicios = [
    {
      'DNI Aspirante': '12345678A',
      'Puesto o Categoria': 'Auxiliar Administrativo/a',
      'Administracion': 'Cabildo de Tenerife',
      'Nivel CD': 16,
      'Dias Trabajados': 3650,
      'Fecha Inicio (Opcional)': '2014-01-01',
      'Fecha Fin (Opcional)': '2023-12-31',
      'Ambito Servicio (Si/No)': 'Si'
    },
    {
      'DNI Aspirante': '87654321B',
      'Puesto o Categoria': 'Auxiliar Administrativo/a Adscrito/a',
      'Administracion': 'Cabildo de Tenerife',
      'Nivel CD': 14,
      'Dias Trabajados': 1460,
      'Fecha Inicio (Opcional)': '2020-01-01',
      'Fecha Fin (Opcional)': '2023-12-31',
      'Ambito Servicio (Si/No)': 'No'
    }
  ];
  const wsServicios = XLSX.utils.json_to_sheet(sampleServicios);
  wsServicios['!cols'] = [
    { wch: 15 }, { wch: 35 }, { wch: 25 }, { wch: 10 }, { wch: 16 }, { wch: 22 }, { wch: 22 }, { wch: 22 }
  ];
  XLSX.utils.book_append_sheet(wb, wsServicios, 'Servicios Cabildo (De Oficio)');

  // Hoja 3: Baremos e Instrucciones
  const infoBaremos = [
    { 'Concepto': 'Cursos Específicos con Aprovechamiento', 'Cálculo': '0.0100 pts/hora', 'Observaciones': 'Máx. Fase 1: 2.0 pts | Fase 2: 1.5 pts' },
    { 'Concepto': 'Cursos Generales con Aprovechamiento', 'Cálculo': '0.0067 pts/hora', 'Observaciones': 'Computa en Fase 1' },
    { 'Concepto': 'Cursos con Asistencia', 'Cálculo': '0.0050 pts/hora', 'Observaciones': 'Computa en Fase 1' },
    { 'Concepto': 'Servicios Cabildo Tenerife (Vinculada)', 'Cálculo': 'Días x factor según CD', 'Observaciones': 'Experiencia vinculada directa Cabildo' },
    { 'Concepto': 'Experiencia Específica de Ámbito', 'Cálculo': '0.000548 pts/día', 'Observaciones': 'Máx. 1.5 pts en Fase 2 (mínimo 6 meses)' }
  ];
  const wsInfo = XLSX.utils.json_to_sheet(infoBaremos);
  wsInfo['!cols'] = [{ wch: 40 }, { wch: 25 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, 'Baremos e Instrucciones');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Plantilla completa de compatibilidad
 */
function generateExcelTemplate(puestosCatalogo = []) {
  return generateTemplateCandidatos(puestosCatalogo);
}

module.exports = {
  normalizarDni,
  parseExcelCandidatos,
  parseWordCandidatos,
  parsePdfCandidatos,
  parseExcelMeritos,
  parseWordMeritos,
  parsePdfMeritos,
  generateCandidateDiff,
  generateMeritsDiff,
  mergeCandidateSolicitud,
  mergeMeritsDeOficio,
  overwriteMeritsDeOficio,
  mergeAspiranteDeOficio,
  generateTemplateCandidatos,
  generateTemplateMeritos,
  generateExcelTemplate
};
