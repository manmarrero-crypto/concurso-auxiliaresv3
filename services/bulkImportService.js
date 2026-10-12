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
 * Intenta localizar puestos del catálogo a partir de una cadena (códigos separados por coma, punto y coma, saltos de línea)
 */
function resolverPuestosSolicitados(strPuestos, puestosCatalogo = []) {
  if (!strPuestos) return [];
  
  let codigos = [];
  if (Array.isArray(strPuestos)) {
    codigos = strPuestos;
  } else {
    // Separar por comas, puntos y comas, barras o saltos de línea
    codigos = String(strPuestos)
      .split(/[,;\n\r/|]+/)
      .map(c => cleanText(c))
      .filter(c => c.length > 0);
  }

  const result = [];
  let orden = 1;

  for (const rawCod of codigos) {
    const codUpper = rawCod.toUpperCase();
    // Buscar coincidencia exacta por ID o código RPT (ej: FC1843, FC11, etc.)
    let match = puestosCatalogo.find(p => 
      (p.codigoRpt && p.codigoRpt.toUpperCase() === codUpper) ||
      (p.id && p.id.toUpperCase() === codUpper)
    );

    // Si no coincide exactamente, buscar si el código está contenido (ej: "Puesto FC1843")
    if (!match) {
      match = puestosCatalogo.find(p => 
        (p.codigoRpt && codUpper.includes(p.codigoRpt.toUpperCase())) ||
        (p.id && codUpper.includes(p.id.toUpperCase()))
      );
    }

    // Si no coincide por código, buscar por similitud en tipo/denominación
    if (!match && rawCod.length > 4) {
      const lower = rawCod.toLowerCase();
      match = puestosCatalogo.find(p => 
        (p.tipo && p.tipo.toLowerCase().includes(lower)) ||
        (p.denominacionLarga && p.denominacionLarga.toLowerCase().includes(lower))
      );
    }

    if (match) {
      // Evitar duplicados del mismo puesto en la misma solicitud
      if (!result.some(r => (r.codigoRpt || r.id) === (match.codigoRpt || match.id))) {
        result.push({
          ...match,
          orden: orden++
        });
      }
    } else if (rawCod.length > 0) {
      // Crear puesto nominal si no está en catálogo
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
 * Analiza un libro Excel (.xlsx, .xls, .csv) y extrae aspirantes y méritos de oficio
 */
function parseExcelImport(buffer, puestosCatalogo = []) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetNames = workbook.SheetNames;

  const candidatosMap = new Map(); // DNI -> Objeto Aspirante
  const cursosDeOficio = []; // { dni, titulo, horas, tipo, caracter }
  const experienciaDeOficio = []; // { dni, puesto, administracion, cd, dias, ambito }

  // 1. Identificar hojas
  let hojaPrincipal = null;
  let hojaCursos = null;
  let hojaExperiencia = null;

  for (const name of sheetNames) {
    const nLow = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (nLow.includes('curso') || nLow.includes('formacion')) {
      hojaCursos = name;
    } else if (nLow.includes('experiencia') || nLow.includes('servicio') || nLow.includes('tiempo')) {
      hojaExperiencia = name;
    } else if (nLow.includes('aspirante') || nLow.includes('solicitud') || nLow.includes('participante') || nLow.includes('candidat')) {
      hojaPrincipal = name;
    }
  }

  // Si no se detectó hoja principal por nombre, usar la primera hoja que no sea de cursos ni experiencia
  if (!hojaPrincipal) {
    hojaPrincipal = sheetNames[0];
  }

  // 2. Procesar hoja principal de Aspirantes / Solicitudes
  if (hojaPrincipal) {
    const sheet = workbook.Sheets[hojaPrincipal];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

    for (const r of rows) {
      // Normalizar nombres de columnas a minúsculas sin acentos
      const normRow = {};
      for (const [k, v] of Object.entries(r)) {
        const cleanK = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        normRow[cleanK] = v;
      }

      // Buscar DNI
      const rawDni = getVal(normRow, ['dni', 'nif', 'nie', 'documento', 'identificacion']);
      const dni = normalizarDni(rawDni);
      if (!dni) continue;

      // Buscar Nombre
      let nombre = cleanText(getVal(normRow, ['nombre y apellidos', 'apellidos y nombre']));
      if (!nombre) {
        const n = getVal(normRow, ['nombre']);
        const a = getVal(normRow, ['apellidos']);
        if (n && a) nombre = cleanText(`${n} ${a}`);
        else if (n) nombre = cleanText(n);
        else nombre = cleanText(getVal(normRow, ['participante', 'aspirante'], 'Aspirante ' + dni));
      }

      // Situación administrativa
      const rawSit = String(getVal(normRow, ['situacion administrativa', 'situacion', 'adscripcion'])).toLowerCase();
      const situacionAdministrativa = rawSit.includes('provis') ? 'provisional' : 'definitiva';

      // Puesto origen
      const puestoOrigen = cleanText(getVal(normRow, ['puesto origen', 'puesto actual', 'destino actual', 'plaza origen']));

      // Grado personal
      const rawGrado = parseInt(getVal(normRow, ['grado personal', 'grado', 'nivel grado'], 16), 10);
      const gradoPersonal = String(isNaN(rawGrado) ? '16' : rawGrado);

      // Conciliación
      const rawHijos = String(getVal(normRow, ['conciliacion hijos', 'hijos', 'concil hijos'])).toLowerCase();
      const conciliacionHijos = rawHijos === 'si' || rawHijos === 'sí' || rawHijos === 'true' || rawHijos === '1' || parseInt(rawHijos, 10) > 0;

      const rawConyuge = String(getVal(normRow, ['conciliacion conyuge', 'conyuge', 'concil conyuge'])).toLowerCase();
      const conciliacionConyuge = rawConyuge === 'si' || rawConyuge === 'sí' || rawConyuge === 'true' || rawConyuge === '1';

      // Antigüedad directa si viene en columnas
      const diasCabildo = parseInt(getVal(normRow, ['dias antiguedad cabildo', 'antiguedad cabildo', 'antiguedad vinculada', 'dias vinculada'], 0), 10) || 0;
      const diasOtras = parseInt(getVal(normRow, ['dias antiguedad otras aapp', 'antiguedad otras', 'dias otras'], 0), 10) || 0;

      // Resultas
      const rawPartRes = String(getVal(normRow, ['participa resultas', 'resultas'], 'si')).toLowerCase();
      const participaResultas = !(rawPartRes === 'no' || rawPartRes === 'false' || rawPartRes === '0');
      const soloResultas = String(getVal(normRow, ['solo resultas'])).toLowerCase() === 'si' || String(getVal(normRow, ['solo resultas'])) === '1';
      const renunciaResultas = String(getVal(normRow, ['renuncia resultas'])).toLowerCase() === 'si' || String(getVal(normRow, ['renuncia resultas'])) === '1';

      // Puestos solicitados
      let puestosArray = [];
      const colPuestosUnicos = getVal(normRow, ['puestos solicitados', 'puestos pedidos', 'plazas solicitadas', 'puestos', 'plazas']);

      if (colPuestosUnicos) {
        puestosArray = resolverPuestosSolicitados(colPuestosUnicos, puestosCatalogo);
      } else {
        // Buscar columnas Puesto 1, Puesto 2, Puesto 3...
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

      candidatosMap.set(dni, {
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
        antiguedadVinculadaDias: diasCabildo,
        antiguedadOtrasDias: diasOtras,
        puestosSolicitados: puestosArray,
        puestoSolicitado: puestosArray[0] || (puestosCatalogo[0] || null),
        merits: {
          cursos: [],
          experiencia: diasCabildo > 0 ? [{
            puesto: puestoOrigen || 'Auxiliar Administrativo/a',
            administracion: 'Cabildo de Tenerife',
            cd: parseInt(gradoPersonal, 10) || 16,
            dias: diasCabildo,
            tipoPlaza: 'vinculada',
            esEspecificaAmbito: false,
            origenArchivo: 'Importación Excel'
          }] : [],
          titulaciones: [],
          idiomas: [],
          archivosProcesados: [{ archivo: hojaPrincipal, tipoDocumentoEstimado: 'Listado Solicitudes Excel' }]
        }
      });
    }
  }

  // 3. Procesar hoja de Formación (De Oficio)
  if (hojaCursos) {
    const sheet = workbook.Sheets[hojaCursos];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

    for (const r of rows) {
      const normRow = {};
      for (const [k, v] of Object.entries(r)) {
        const cleanK = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        normRow[cleanK] = v;
      }

      const dni = normalizarDni(getVal(normRow, ['dni', 'nif', 'documento', 'aspirante']));
      const titulo = cleanText(getVal(normRow, ['titulo', 'curso', 'denominacion', 'actividad']));
      const horas = parseFloat(getVal(normRow, ['horas', 'duracion', 'creditos'], 0)) || 0;
      const rawTipo = String(getVal(normRow, ['tipo', 'modalidad'], 'Aprovechamiento')).toLowerCase();
      const tipo = rawTipo.includes('asist') ? 'Asistencia' : 'Aprovechamiento';
      const rawCar = String(getVal(normRow, ['caracter', 'materia', 'tipo materia'], 'Específico')).toLowerCase();
      const esEsp = rawCar.includes('espec') || (!rawCar.includes('general') && !rawCar.includes('transversal'));
      const caracter = esEsp ? 'Específico' : 'General / Transversal';

      if (dni && titulo && horas > 0) {
        cursosDeOficio.push({
          dni,
          titulo,
          horas,
          tipo,
          caracter,
          esEspecifico: esEsp,
          incluido: true,
          origenArchivo: `Oficio (${hojaCursos})`
        });
      }
    }
  }

  // 4. Procesar hoja de Experiencia / Servicios Prestados (De Oficio)
  if (hojaExperiencia) {
    const sheet = workbook.Sheets[hojaExperiencia];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

    for (const r of rows) {
      const normRow = {};
      for (const [k, v] of Object.entries(r)) {
        const cleanK = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        normRow[cleanK] = v;
      }

      const dni = normalizarDni(getVal(normRow, ['dni', 'nif', 'documento', 'aspirante']));
      const puesto = cleanText(getVal(normRow, ['puesto', 'categoria', 'cuerpo'], 'Auxiliar Administrativo/a'));
      const administracion = cleanText(getVal(normRow, ['administracion', 'entidad', 'organismo'], 'Cabildo de Tenerife'));
      const cd = parseInt(getVal(normRow, ['cd', 'nivel', 'nivel cd'], 16), 10) || 16;
      let dias = parseInt(getVal(normRow, ['dias', 'dias trabajados', 'tiempo'], 0), 10) || 0;

      // Si no vienen días pero vienen fechas
      const fIni = getVal(normRow, ['fecha inicio', 'inicio', 'desde']);
      const fFin = getVal(normRow, ['fecha fin', 'fin', 'hasta']);
      if (dias <= 0 && fIni && fFin) {
        const dIni = new Date(fIni);
        const dFin = new Date(fFin);
        if (!isNaN(dIni.getTime()) && !isNaN(dFin.getTime())) {
          dias = Math.max(1, Math.round((dFin - dIni) / (1000 * 60 * 60 * 24)) + 1);
        }
      }

      const rawAmbito = String(getVal(normRow, ['ambito', 'especifica ambito', 'especifica'])).toLowerCase();
      const esEspecificaAmbito = rawAmbito === 'si' || rawAmbito === 'sí' || rawAmbito === 'true' || rawAmbito === '1';

      if (dni && dias > 0) {
        experienciaDeOficio.push({
          dni,
          puesto,
          administracion,
          cd,
          dias,
          tipoPlaza: administracion.toLowerCase().includes('cabildo') || administracion.toLowerCase().includes('iass') ? 'vinculada' : 'otra',
          esEspecificaAmbito,
          origenArchivo: `Oficio (${hojaExperiencia})`
        });
      }
    }
  }

  // 5. Asignar méritos de oficio a los candidatos
  for (const c of cursosDeOficio) {
    if (!candidatosMap.has(c.dni)) {
      // Si el aspirante no estaba en la hoja principal, crearlo con datos base
      candidatosMap.set(c.dni, {
        id: c.dni,
        dni: c.dni,
        nombre: 'Aspirante ' + c.dni,
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
        puestosSolicitados: puestosCatalogo.length > 0 ? [{ ...puestosCatalogo[0], orden: 1 }] : [],
        puestoSolicitado: puestosCatalogo[0] || null,
        merits: { cursos: [], experiencia: [], titulaciones: [], idiomas: [], archivosProcesados: [] }
      });
    }

    const asp = candidatosMap.get(c.dni);
    asp.merits.cursos.push(c);
  }

  for (const exp of experienciaDeOficio) {
    if (!candidatosMap.has(exp.dni)) {
      candidatosMap.set(exp.dni, {
        id: exp.dni,
        dni: exp.dni,
        nombre: 'Aspirante ' + exp.dni,
        situacionAdministrativa: 'definitiva',
        puestoOrigen: exp.puesto || '',
        participaResultas: true,
        soloResultas: false,
        renunciaResultas: false,
        gradoPersonal: String(exp.cd || 16),
        conciliacionHijos: false,
        conciliacionConyuge: false,
        antiguedadVinculadaDias: 0,
        antiguedadOtrasDias: 0,
        puestosSolicitados: puestosCatalogo.length > 0 ? [{ ...puestosCatalogo[0], orden: 1 }] : [],
        puestoSolicitado: puestosCatalogo[0] || null,
        merits: { cursos: [], experiencia: [], titulaciones: [], idiomas: [], archivosProcesados: [] }
      });
    }

    const asp = candidatosMap.get(exp.dni);
    asp.merits.experiencia.push(exp);
    if (exp.tipoPlaza === 'otra') {
      asp.antiguedadOtrasDias = (asp.antiguedadOtrasDias || 0) + exp.dias;
    } else {
      asp.antiguedadVinculadaDias = (asp.antiguedadVinculadaDias || 0) + exp.dias;
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
    candidatos: Array.from(candidatosMap.values()),
    totalCursosOficio: cursosDeOficio.length,
    totalExperienciaOficio: experienciaDeOficio.length
  };
}

/**
 * Analiza un documento Word (.docx) para extraer tablas o listados de aspirantes
 */
async function parseWordImport(buffer, puestosCatalogo = []) {
  const htmlResult = await mammoth.convertToHtml({ buffer });
  const rawResult = await mammoth.extractRawText({ buffer });
  const html = htmlResult.value || '';
  const text = rawResult.value || '';

  const candidatosMap = new Map();

  // 1. Extraer tablas de Word si existen
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
      const colNom = header.findIndex(c => c.includes('nombre') || c.includes('apellidos') || c.includes('aspirante') || c.includes('participante'));
      const colPuestos = header.findIndex(c => c.includes('puesto') || c.includes('plaza') || c.includes('solicitud') || c.includes('codigo'));
      const colDias = header.findIndex(c => c.includes('dias') || c.includes('tiempo') || c.includes('antiguedad'));
      const colHoras = header.findIndex(c => c.includes('horas') || c.includes('duracion'));
      const colCurso = header.findIndex(c => c.includes('curso') || c.includes('formacion') || c.includes('denominacion'));

      if (colDni >= 0) {
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const dni = normalizarDni(row[colDni]);
          if (!dni) continue;

          const nombre = colNom >= 0 && row[colNom] ? cleanText(row[colNom]) : 'Aspirante ' + dni;

          if (!candidatosMap.has(dni)) {
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
              puestosSolicitados: [],
              puestoSolicitado: null,
              merits: { cursos: [], experiencia: [], titulaciones: [], idiomas: [], archivosProcesados: [] }
            });
          }

          const asp = candidatosMap.get(dni);

          // Si es tabla de solicitudes y puestos
          if (colPuestos >= 0 && row[colPuestos]) {
            const puestos = resolverPuestosSolicitados(row[colPuestos], puestosCatalogo);
            if (puestos.length > 0) {
              asp.puestosSolicitados = puestos;
              asp.puestoSolicitado = puestos[0];
            }
          }

          // Si es tabla de cursos de oficio
          if (colCurso >= 0 && row[colCurso] && colHoras >= 0 && row[colHoras]) {
            const h = parseFloat(row[colHoras]) || 0;
            if (h > 0) {
              asp.merits.cursos.push({
                titulo: cleanText(row[colCurso]),
                horas: h,
                tipo: 'Aprovechamiento',
                caracter: 'Específico',
                esEspecifico: true,
                incluido: true,
                origenArchivo: 'Word (De Oficio)'
              });
            }
          }

          // Si es tabla de experiencia / días
          if (colDias >= 0 && row[colDias]) {
            const d = parseInt(row[colDias], 10) || 0;
            if (d > 0) {
              asp.antiguedadVinculadaDias = (asp.antiguedadVinculadaDias || 0) + d;
              asp.merits.experiencia.push({
                puesto: 'Auxiliar Administrativo/a',
                administracion: 'Cabildo de Tenerife',
                cd: 16,
                dias: d,
                tipoPlaza: 'vinculada',
                esEspecificaAmbito: false,
                origenArchivo: 'Word (De Oficio)'
              });
            }
          }
        }
      }
    }
  }

  // 2. Si no había tablas o quedaron pocos, intentar parseo por expresiones regulares en texto plano
  if (candidatosMap.size === 0 && text) {
    // Buscar patrones tipo: DNI: 12345678A / Nombre: Juan Perez / Puestos: FC1843
    const dniRegex = /\b([0-9]{8}[A-Z]|[XYZ][0-9]{7}[A-Z])\b/gi;
    const lines = text.split('\n');

    for (const line of lines) {
      const matchDni = line.match(dniRegex);
      if (matchDni) {
        const dni = normalizarDni(matchDni[0]);
        if (!candidatosMap.has(dni)) {
          // Extraer lo que rodea al DNI
          let nombre = line.replace(dniRegex, '').replace(/[-–—,;:]+/g, ' ').trim();
          if (nombre.length > 50) nombre = nombre.substring(0, 50);
          if (!nombre) nombre = 'Aspirante ' + dni;

          // Buscar códigos de puesto en la línea (FC...)
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
    candidatos: Array.from(candidatosMap.values())
  };
}

/**
 * Analiza un documento PDF para extraer aspirantes y solicitudes
 */
async function parsePdfImport(buffer, puestosCatalogo = []) {
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
        // Extraer texto restante como nombre o puestos
        let resto = line.replace(dniRegex, '').replace(/[-–—,;:|]+/g, ' ').trim();
        
        // Buscar puestos FC...
        const fcMatches = line.match(/FC[0-9]{2,4}/gi);
        let puestos = [];
        if (fcMatches) {
          puestos = resolverPuestosSolicitados(fcMatches.join(','), puestosCatalogo);
          resto = resto.replace(/FC[0-9]{2,4}/gi, '').trim();
        }

        // Buscar días
        let dias = 0;
        const diasMatch = line.match(/(\d+)\s*d[ií]as/i);
        if (diasMatch) {
          dias = parseInt(diasMatch[1], 10) || 0;
          resto = resto.replace(diasMatch[0], '').trim();
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
          antiguedadVinculadaDias: dias,
          antiguedadOtrasDias: 0,
          puestosSolicitados: puestos.length > 0 ? puestos : (puestosCatalogo.length > 0 ? [{ ...puestosCatalogo[0], orden: 1 }] : []),
          puestoSolicitado: puestos[0] || (puestosCatalogo[0] || null),
          merits: {
            cursos: [],
            experiencia: dias > 0 ? [{
              puesto: 'Auxiliar Administrativo/a',
              administracion: 'Cabildo de Tenerife',
              cd: 16,
              dias,
              tipoPlaza: 'vinculada',
              esEspecificaAmbito: false,
              origenArchivo: 'PDF (De Oficio)'
            }] : [],
            titulaciones: [],
            idiomas: [],
            archivosProcesados: []
          }
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
    candidatos: Array.from(candidatosMap.values())
  };
}

/**
 * Genera una comparativa detallada y pormenorizada (diff) entre el aspirante existente y el nuevo
 */
function generateCandidateDiff(existente, nuevo) {
  const cambios = [];

  // 1. Nombre
  if (nuevo.nombre && existente.nombre && nuevo.nombre.trim() !== existente.nombre.trim()) {
    cambios.push({
      campo: 'Nombre y Apellidos',
      anterior: existente.nombre,
      nuevo: nuevo.nombre,
      tipo: 'modificado'
    });
  }

  // 2. Situación Administrativa
  if (nuevo.situacionAdministrativa && nuevo.situacionAdministrativa !== existente.situacionAdministrativa) {
    cambios.push({
      campo: 'Situación Administrativa',
      anterior: existente.situacionAdministrativa || 'definitiva',
      nuevo: nuevo.situacionAdministrativa,
      tipo: 'modificado'
    });
  }

  // 3. Puesto Origen
  if (nuevo.puestoOrigen && nuevo.puestoOrigen !== existente.puestoOrigen) {
    cambios.push({
      campo: 'Puesto de Origen',
      anterior: existente.puestoOrigen || '(Sin especificar)',
      nuevo: nuevo.puestoOrigen,
      tipo: 'modificado'
    });
  }

  // 4. Grado Personal
  if (nuevo.gradoPersonal && String(nuevo.gradoPersonal) !== String(existente.gradoPersonal)) {
    cambios.push({
      campo: 'Grado Personal',
      anterior: String(existente.gradoPersonal || '16'),
      nuevo: String(nuevo.gradoPersonal),
      tipo: 'modificado'
    });
  }

  // 5. Conciliación Hijos
  if (nuevo.conciliacionHijos !== undefined && nuevo.conciliacionHijos !== existente.conciliacionHijos) {
    cambios.push({
      campo: 'Conciliación por Hijos',
      anterior: existente.conciliacionHijos ? 'Sí' : 'No',
      nuevo: nuevo.conciliacionHijos ? 'Sí' : 'No',
      tipo: 'modificado'
    });
  }

  // 6. Conciliación Cónyuge
  if (nuevo.conciliacionConyuge !== undefined && nuevo.conciliacionConyuge !== existente.conciliacionConyuge) {
    cambios.push({
      campo: 'Conciliación por Cónyuge',
      anterior: existente.conciliacionConyuge ? 'Sí' : 'No',
      nuevo: nuevo.conciliacionConyuge ? 'Sí' : 'No',
      tipo: 'modificado'
    });
  }

  // 7. Puestos Solicitados y orden de prelación
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

  // 8. Antigüedad en Cabildo (días)
  const dAntVin = existente.antiguedadVinculadaDias || 0;
  const dNuevVin = nuevo.antiguedadVinculadaDias || 0;
  if (dNuevVin > 0 && dNuevVin !== dAntVin) {
    const diff = dNuevVin - dAntVin;
    cambios.push({
      campo: 'Días Antigüedad Cabildo',
      anterior: `${dAntVin} días`,
      nuevo: `${dNuevVin} días (${diff > 0 ? '+' : ''}${diff} días)`,
      tipo: diff > 0 ? 'incrementado' : 'modificado'
    });
  }

  // 9. Antigüedad en Otras Administraciones (días)
  const dAntOtr = existente.antiguedadOtrasDias || 0;
  const dNuevOtr = nuevo.antiguedadOtrasDias || 0;
  if (dNuevOtr > 0 && dNuevOtr !== dAntOtr) {
    const diff = dNuevOtr - dAntOtr;
    cambios.push({
      campo: 'Días Antigüedad Otras Administraciones',
      anterior: `${dAntOtr} días`,
      nuevo: `${dNuevOtr} días (${diff > 0 ? '+' : ''}${diff} días)`,
      tipo: diff > 0 ? 'incrementado' : 'modificado'
    });
  }

  // 10. Cursos de Formación (De Oficio)
  const cursosAnt = existente.merits?.cursos || [];
  const cursosNuevos = nuevo.merits?.cursos || [];
  const cursosParaAnadir = cursosNuevos.filter(cn => 
    !cursosAnt.some(ca => cleanText(ca.titulo).toLowerCase() === cleanText(cn.titulo).toLowerCase() && parseFloat(ca.horas) === parseFloat(cn.horas))
  );

  if (cursosParaAnadir.length > 0) {
    const horasNuevas = cursosParaAnadir.reduce((acc, c) => acc + (parseFloat(c.horas) || 0), 0);
    cambios.push({
      campo: 'Cursos de Formación (De Oficio)',
      anterior: `${cursosAnt.length} curso(s) registrado(s)`,
      nuevo: `+${cursosParaAnadir.length} curso(s) nuevo(s) (+${horasNuevas} horas)`,
      detalleItems: cursosParaAnadir.map(c => `• ${c.titulo} (${c.horas}h - ${c.caracter})`),
      tipo: 'anadido'
    });
  }

  // 11. Experiencia / Servicios Prestados (De Oficio)
  const expAnt = existente.merits?.experiencia || [];
  const expNuevos = nuevo.merits?.experiencia || [];
  const expParaAnadir = expNuevos.filter(en => 
    !expAnt.some(ea => cleanText(ea.puesto).toLowerCase() === cleanText(en.puesto).toLowerCase() && parseInt(ea.dias, 10) === parseInt(en.dias, 10))
  );

  if (expParaAnadir.length > 0) {
    const diasNuevos = expParaAnadir.reduce((acc, e) => acc + (parseInt(e.dias, 10) || 0), 0);
    cambios.push({
      campo: 'Servicios Prestados Cabildo (De Oficio)',
      anterior: `${expAnt.length} período(s) registrado(s)`,
      nuevo: `+${expParaAnadir.length} período(s) nuevo(s) (+${diasNuevos} días)`,
      detalleItems: expParaAnadir.map(e => `• ${e.puesto} - ${e.administracion} (${e.dias} días)`),
      tipo: 'anadido'
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
 * Fusiona de forma inteligente los méritos "de oficio" del nuevo aspirante en el existente
 * sin perder las titulaciones, cursos o experiencia previa ya baremada
 */
function mergeAspiranteDeOficio(existente, nuevo) {
  const merged = JSON.parse(JSON.stringify(existente));

  if (!merged.merits) {
    merged.merits = { cursos: [], experiencia: [], titulaciones: [], idiomas: [], archivosProcesados: [] };
  }
  if (!Array.isArray(merged.merits.cursos)) merged.merits.cursos = [];
  if (!Array.isArray(merged.merits.experiencia)) merged.merits.experiencia = [];
  if (!Array.isArray(merged.merits.titulaciones)) merged.merits.titulaciones = [];
  if (!Array.isArray(merged.merits.idiomas)) merged.merits.idiomas = [];
  if (!Array.isArray(merged.merits.archivosProcesados)) merged.merits.archivosProcesados = [];

  // Actualizar datos generales si los existentes estaban vacíos
  if (!merged.puestoOrigen && nuevo.puestoOrigen) merged.puestoOrigen = nuevo.puestoOrigen;
  if (!merged.puestosSolicitados || merged.puestosSolicitados.length === 0) {
    merged.puestosSolicitados = nuevo.puestosSolicitados || [];
    merged.puestoSolicitado = nuevo.puestoSolicitado || null;
  }

  // 1. Añadir cursos de oficio evitando duplicados
  const nuevosCursos = nuevo.merits?.cursos || [];
  for (const nc of nuevosCursos) {
    const yaExiste = merged.merits.cursos.some(c => 
      cleanText(c.titulo).toLowerCase() === cleanText(nc.titulo).toLowerCase() &&
      parseFloat(c.horas) === parseFloat(nc.horas)
    );
    if (!yaExiste) {
      merged.merits.cursos.push(nc);
    }
  }

  // 2. Añadir experiencia de oficio evitando duplicados
  const nuevaExp = nuevo.merits?.experiencia || [];
  for (const ne of nuevaExp) {
    const yaExiste = merged.merits.experiencia.some(e => 
      cleanText(e.puesto).toLowerCase() === cleanText(ne.puesto).toLowerCase() &&
      parseInt(e.dias, 10) === parseInt(ne.dias, 10)
    );
    if (!yaExiste) {
      merged.merits.experiencia.push(ne);
    }
  }

  // 3. Recalcular antigüedad vinculada y otras a partir de los períodos consolidados
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

  // Respetar el mayor valor entre los días directos y los calculados
  merged.antiguedadVinculadaDias = Math.max(merged.antiguedadVinculadaDias || 0, totalVin, nuevo.antiguedadVinculadaDias || 0);
  merged.antiguedadOtrasDias = Math.max(merged.antiguedadOtrasDias || 0, totalOtr, nuevo.antiguedadOtrasDias || 0);

  // Registro de archivo procesado
  merged.merits.archivosProcesados.push({
    archivo: 'Fusión de Oficio Masiva',
    tipoDocumentoEstimado: 'Actualización De Oficio',
    fecha: new Date().toISOString()
  });

  // Recalcular puntuación con la función oficial
  if (merged.puestoSolicitado) {
    try {
      merged.resultadoCalculo = calculateScore(merged, merged.merits);
    } catch (e) {
      // Ignorar error si falta algún campo
    }
  }

  return merged;
}

/**
 * Genera un archivo Excel (.xlsx) oficial como plantilla para que el usuario pueda rellenarlo
 */
function generateExcelTemplate(puestosCatalogo = []) {
  const wb = XLSX.utils.book_new();

  // Hoja 1: Aspirantes y Solicitudes
  const sampleAspirantes = [
    {
      'DNI': '12345678A',
      'Nombre y Apellidos': 'Marrero Pérez, Carmen Rosa',
      'Situacion Administrativa': 'definitiva',
      'Puesto Origen': 'FC1843 - Auxiliar Adm. Proyectos',
      'Puestos Solicitados (Codigos separados por coma)': 'FC1843, FC1897, FC11',
      'Grado Personal': 16,
      'Conciliacion Hijos (Si/No)': 'Si',
      'Conciliacion Conyuge (Si/No)': 'No',
      'Participa Resultas (Si/No)': 'Si',
      'Dias Antiguedad Cabildo': 3650,
      'Dias Antiguedad Otras AAPP': 365
    },
    {
      'DNI': '87654321B',
      'Nombre y Apellidos': 'González Hernández, Francisco Javier',
      'Situacion Administrativa': 'provisional',
      'Puesto Origen': 'Adscripción provisional Cabildo',
      'Puestos Solicitados (Codigos separados por coma)': 'FC1897, FC1808',
      'Grado Personal': 14,
      'Conciliacion Hijos (Si/No)': 'No',
      'Conciliacion Conyuge (Si/No)': 'Si',
      'Participa Resultas (Si/No)': 'Si',
      'Dias Antiguedad Cabildo': 1460,
      'Dias Antiguedad Otras AAPP': 0
    },
    {
      'DNI': '45678901C',
      'Nombre y Apellidos': 'Rodríguez Cabrera, Beatriz',
      'Situacion Administrativa': 'definitiva',
      'Puesto Origen': 'FC1897 - Gestor de Contenidos',
      'Puestos Solicitados (Codigos separados por coma)': 'FC11, FC1843',
      'Grado Personal': 18,
      'Conciliacion Hijos (Si/No)': 'No',
      'Conciliacion Conyuge (Si/No)': 'No',
      'Participa Resultas (Si/No)': 'No',
      'Dias Antiguedad Cabildo': 2555,
      'Dias Antiguedad Otras AAPP': 730
    }
  ];
  const wsAspirantes = XLSX.utils.json_to_sheet(sampleAspirantes);
  wsAspirantes['!cols'] = [
    { wch: 14 }, { wch: 35 }, { wch: 22 }, { wch: 32 }, { wch: 45 },
    { wch: 15 }, { wch: 22 }, { wch: 24 }, { wch: 22 }, { wch: 24 }, { wch: 26 }
  ];
  XLSX.utils.book_append_sheet(wb, wsAspirantes, 'Aspirantes y Solicitudes');

  // Hoja 2: Formación (De Oficio)
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

  // Hoja 3: Servicios Cabildo (De Oficio)
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

  // Hoja 4: Catálogo de Puestos (Referencia oficial para copiar códigos)
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

module.exports = {
  normalizarDni,
  parseExcelImport,
  parseWordImport,
  parsePdfImport,
  generateCandidateDiff,
  mergeAspiranteDeOficio,
  generateExcelTemplate
};
