/**
 * Extractor inteligente de méritos y datos desde archivos PDF y Word (.docx / .doc)
 * Soporta tablas de Word, listas con viñetas, expresiones de horas, días, meses y años,
 * y documentos estructurados como "TIEMPO TRABAJADO" o "CURSOS DE FORMACIÓN".
 */
const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');

const MATERIAS_ESPECIFICAS_KEYWORDS = [
  'procedimiento administrativo', 'ley 39/2015', 'ley 40/2015', 'ofimática', 'ofimatica',
  'excel', 'word', 'access', 'powerpoint', 'outlook', 'gestor de expedientes', 'sigec', 'sicalwin',
  'facturación', 'factura electrónica', 'registro', 'secretaría', 'pantallas de visualización',
  'teletrabajo', 'trastornos músculo', 'ergonomía', 'contratación administrativa',
  'presupuestaria', 'atención ciudadana', 'atención al ciudadano', 'atención', 'atencion', 'ciudadana', 'ciudadanía',
  'canales digitales', 'extensión agraria', 'liderazgo', 'organización del trabajo', 'resolución de conflictos',
  'evaluación del rendimiento', 'específico', 'especifico', 'tributaria', 'recaudación', 'patrimonio',
  'expediente', 'gestión', 'gestion', 'archivo', 'documentación', 'documentacion'
];

const MATERIAS_GENERALES_KEYWORDS = [
  'igualdad', 'género', 'genero', 'acoso', 'diversidad', 'agenda 2030', 'ods',
  'ética', 'etica', 'transparencia', 'buen gobierno', 'estatuto básico', 'trebep',
  'calidad', 'seguridad', 'ciberseguridad', 'esquema nacional', 'ens',
  'prevención de riesgos', 'primeros auxilios', 'habilidades', 'gestión del tiempo',
  'inteligencia emocional', 'transversal', 'general', 'idiomas'
];

async function extractContentFromBuffer(buffer, mimetype, originalname) {
  const ext = (originalname.split('.').pop() || '').toLowerCase();

  if (ext === 'pdf' || mimetype === 'application/pdf') {
    const parser = new PDFParse({ data: buffer });
    const data = await parser.getText();
    return {
      text: data.text || '',
      html: null,
      tipo: 'pdf'
    };
  } else if (ext === 'docx' || mimetype.includes('wordprocessingml') || ext === 'doc') {
    try {
      const htmlResult = await mammoth.convertToHtml({ buffer });
      const rawResult = await mammoth.extractRawText({ buffer });
      return {
        text: rawResult.value || '',
        html: htmlResult.value || '',
        tipo: 'docx'
      };
    } catch (e) {
      const rawText = buffer.toString('utf-8');
      return {
        text: rawText,
        html: null,
        tipo: 'docx-fallback'
      };
    }
  } else {
    return {
      text: buffer.toString('utf-8'),
      html: null,
      tipo: 'texto'
    };
  }
}

// Analizar tablas HTML generadas por Mammoth desde Word
function parseTablesFromHtml(html, filename) {
  const cursos = [];
  const experiencia = [];

  if (!html || !html.includes('<table')) return { cursos, experiencia };

  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tMatch;

  while ((tMatch = tableRegex.exec(html)) !== null) {
    const tableContent = tMatch[1];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rMatch;
    const rows = [];

    while ((rMatch = rowRegex.exec(tableContent)) !== null) {
      const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let cMatch;
      const cells = [];
      while ((cMatch = cellRegex.exec(rMatch[1])) !== null) {
        const cellText = cMatch[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim();
        cells.push(cellText);
      }
      if (cells.length > 0) rows.push(cells);
    }

    if (rows.length < 2) continue;

    const headerRow = rows[0].map(c => c.toLowerCase());
    const isCursoTable = headerRow.some(c => c.includes('curso') || c.includes('formaci') || c.includes('materia') || c.includes('título') || c.includes('horas') || c.includes('denominaci'));
    const isExpTable = headerRow.some(c => c.includes('puesto') || c.includes('servicio') || c.includes('días') || c.includes('dias') || c.includes('tiempo') || c.includes('categoría') || c.includes('administra') || c.includes('nivel'));

    const colHorasIdx = headerRow.findIndex(c => c.includes('hora') || c.includes('duraci') || c.includes('crédit'));
    const colTituloIdx = headerRow.findIndex(c => c.includes('curso') || c.includes('denominaci') || c.includes('materia') || c.includes('título') || c.includes('nombre') || c.includes('actividad'));

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length === 0) continue;

      const fullRowText = row.join(' ');
      const rowLower = fullRowText.toLowerCase();

      let horas = null;
      let titulo = null;
      let tipo = 'Asistencia';
      let caracter = 'General / Transversal';

      // 1. Extraer horas de columna específica si existe
      if (colHorasIdx >= 0 && row[colHorasIdx]) {
        const hVal = parseFloat(row[colHorasIdx].replace(',', '.').replace(/[^\d.]/g, ''));
        if (!isNaN(hVal) && hVal > 0 && hVal <= 1000) horas = hVal;
      }

      // 2. Extraer título de columna específica si existe
      if (colTituloIdx >= 0 && row[colTituloIdx]) {
        titulo = row[colTituloIdx];
      }

      // 3. Fallback genérico por celdas si no se detectó por columna
      if (!horas || !titulo) {
        for (let cIdx = 0; cIdx < row.length; cIdx++) {
          const cell = row[cIdx];
          const unitMatch = cell.match(/(?:\b(\d+(?:[.,]\d+)?)\s*(?:horas?|hrs?\.?|créditos?|creditos?)\b|\b(\d+(?:[.,]\d+)?)\s*h(?:\.|\b|\)))/i);
          if (unitMatch && !horas) {
            horas = parseFloat((unitMatch[1] || unitMatch[2]).replace(',', '.'));
          } else if (cell.length > 3 && !titulo && isNaN(cell)) {
            titulo = cell;
          }
        }
      }

      if (rowLower.includes('aprovechamiento') || rowLower.includes('apto') || rowLower.includes('superado') || rowLower.includes('impartid')) {
        tipo = 'Aprovechamiento';
      }

      if (MATERIAS_ESPECIFICAS_KEYWORDS.some(kw => rowLower.includes(kw))) {
        caracter = 'Específico';
      }

      if (horas && horas > 0) {
        cursos.push({
          titulo: (titulo || 'Curso de formación').trim(),
          horas: horas,
          tipo: tipo,
          caracter: caracter,
          esEspecifico: (caracter === 'Específico'),
          incluido: true,
          origenArchivo: filename
        });
      }

      const diasMatch = fullRowText.match(/(\d+)\s*(?:días|dias)/i);
      const aniosMatch = fullRowText.match(/(\d+)\s*(?:años|anos)/i);
      const mesesMatch = fullRowText.match(/(\d+)\s*meses?/i);
      const cdMatch = fullRowText.match(/(?:cd|nivel|complemento)\s*:?\s*(\d{2})/i);

      if (diasMatch || aniosMatch || mesesMatch || isExpTable) {
        let dias = 0;
        if (diasMatch) dias += parseInt(diasMatch[1], 10);
        if (aniosMatch) dias += parseInt(aniosMatch[1], 10) * 365;
        if (mesesMatch) dias += parseInt(mesesMatch[1], 10) * 30;

        if (dias > 0) {
          const cd = cdMatch ? parseInt(cdMatch[1], 10) : 16;
          const esCabildo = /cabildo|iass/i.test(fullRowText);
          experiencia.push({
            puesto: (row[0] || 'Auxiliar Administrativo/a').trim(),
            administracion: esCabildo ? 'Cabildo Insular de Tenerife' : (row[1] || 'Otras Administraciones'),
            cd: cd,
            dias: dias,
            tipoPlaza: 'vinculada',
            esEspecificaAmbito: /atención ciudadana|contratación|personal|recursos humanos/i.test(fullRowText),
            origenArchivo: filename
          });
        }
      }
    }
  }

  return { cursos, experiencia };
}

// Analizar texto plano y contextual
function analyzeTextForMerits(text, filename, htmlContent = null) {
  const cleanText = (text || '').replace(/\r\n/g, '\n');
  const lines = cleanText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const findings = {
    archivo: filename,
    tipoDocumentoEstimado: 'Documento de Méritos',
    datosCandidato: {},
    cursos: [],
    experiencia: [],
    titulaciones: [],
    idiomas: [],
    gradoDetectado: null,
    textoExtraidoPreview: cleanText.substring(0, 2000)
  };

  // 1. Si viene de Word con HTML, probar extracción de tablas primero
  if (htmlContent) {
    const tableResults = parseTablesFromHtml(htmlContent, filename);
    if (tableResults.cursos.length > 0) findings.cursos.push(...tableResults.cursos);
    if (tableResults.experiencia.length > 0) findings.experiencia.push(...tableResults.experiencia);
  }

  // 2. Detección de DNI y Nombre
  const dniMatch = cleanText.match(/\b(\d{8}[A-HJ-NP-TV-Z]|[XYZ]\d{7}[A-Z])\b/i);
  if (dniMatch) {
    findings.datosCandidato.dni = dniMatch[1].toUpperCase();
  }
  const nombreMatch = cleanText.match(/(?:D\.|Dña\.|Don|Doña|aspirante|participante|a favor de|alumna?|nombre:?)\s*:?\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3})/i);
  if (nombreMatch) {
    findings.datosCandidato.nombre = nombreMatch[1].trim();
  }

  // 3. Detección de Grado Personal
  const gradoMatch = cleanText.match(/(?:grado\s+personal|nivel\s+consolidado).*?(?:nivel|de)\s*(\d{2})/i);
  if (gradoMatch) {
    const gVal = parseInt(gradoMatch[1], 10);
    if (gVal >= 12 && gVal <= 30) {
      findings.gradoDetectado = gVal;
    }
  }

  // 4. Contexto global del documento
  const isDocExperiencia = /tiempo\s+trabajado|servicios\s+prestados|vida\s+laboral|antigüedad|experiencia/i.test(cleanText) ||
                           /tiempo\s+trabajado/i.test(filename);
  const isDocCursos = /curso|formaci|diploma|accion(?:es)?\s+formativa/i.test(cleanText) ||
                      /curso/i.test(filename);

  // Detección de Administración general mencionada en el documento
  let defaultAdmin = 'Cabildo Insular de Tenerife';
  if (/otra[s]?\s+administraci/i.test(cleanText) || /ayuntamiento/i.test(cleanText) || /gobierno\s+de\s+canarias/i.test(cleanText)) {
    const adminMatch = cleanText.match(/(?:en\s+|para\s+)?(ayuntamiento\s+de\s+[a-záéíóúñ\s]+|gobierno\s+de\s+canarias|cabildo\s+de\s+[a-záéíóúñ\s]+)/i);
    if (adminMatch) defaultAdmin = adminMatch[1].trim();
  } else if (/cabildo/i.test(cleanText)) {
    defaultAdmin = 'Cabildo Insular de Tenerife';
  }

  // 5. Análisis línea por línea para TIEMPO TRABAJADO / SERVICIOS PRESTADOS
  lines.forEach(line => {
    const lineLower = line.toLowerCase();

    // Patrón A: Líneas con "Nivel XX" y duración ("X años", "X meses", "X días")
    // Ej: "Nivel 14 10 años", "Nivel 16 7 años", "Nivel 18 3 años como Jefe de negociado", "Nivel 18 como gestor de contenidos: 3 años"
    const nivelMatch = line.match(/(?:nivel|cd|complemento)\s*:?\s*(\d{2})/i);
    const aniosMatch = line.match(/(\d+(?:[.,]\d+)?)\s*(?:años|anos)/i);
    const mesesMatch = line.match(/(\d+(?:[.,]\d+)?)\s*meses?/i);
    const diasMatch = line.match(/(\d+)\s*(?:días|dias)/i);

    if (nivelMatch && (aniosMatch || mesesMatch || diasMatch || isDocExperiencia)) {
      const cd = parseInt(nivelMatch[1], 10);
      let dias = 0;
      if (diasMatch) dias += parseInt(diasMatch[1], 10);
      if (aniosMatch) dias += Math.round(parseFloat(aniosMatch[1].replace(',', '.')) * 365);
      if (mesesMatch) dias += Math.round(parseFloat(mesesMatch[1].replace(',', '.')) * 30);

      // Determinar puesto según el texto o el nivel
      let puesto = 'Auxiliar Administrativo/a';
      if (lineLower.includes('jefe') || lineLower.includes('negociado')) puesto = 'Jefe/a de Negociado';
      else if (lineLower.includes('gestor') && lineLower.includes('contenido')) puesto = 'Gestor/a de Contenidos Digitales';
      else if (lineLower.includes('gestor') && lineLower.includes('servicio')) puesto = 'Gestor/a de Servicios';
      else if (lineLower.includes('gestor') && lineLower.includes('informaci')) puesto = 'Gestor/a de Información';
      else if (lineLower.includes('gestor')) puesto = 'Gestor/a';
      else if (lineLower.includes('adscrito')) puesto = 'Auxiliar Administrativo/a Adscrito/a';
      else if (lineLower.includes('agraria')) puesto = 'Auxiliar de Extensión Agraria';
      else if (cd === 14) puesto = 'Auxiliar Administrativo/a Adscrito/a';
      else if (cd === 18) puesto = 'Jefe/a de Negociado / Gestor';

      // Ámbito específico del servicio (para Fase 2 en concurso específico)
      const esEspAmbito = /atención|contratación|personal|recursos humanos|gestor|contenido|jurídic|agraria/i.test(lineLower);

      if (dias > 0) {
        findings.experiencia.push({
          puesto,
          administracion: defaultAdmin,
          cd,
          dias,
          tipoPlaza: 'vinculada',
          esEspecificaAmbito: esEspAmbito,
          origenArchivo: filename
        });
      }
    }
    // Patrón B: Líneas de servicios sin "Nivel" pero con duración y cargo o contexto
    else if ((isDocExperiencia || lineLower.includes('auxiliar') || lineLower.includes('gestor') || lineLower.includes('jefe') || lineLower.includes('adscrito')) && (aniosMatch || mesesMatch || diasMatch)) {
      let dias = 0;
      if (diasMatch) dias += parseInt(diasMatch[1], 10);
      if (aniosMatch) dias += Math.round(parseFloat(aniosMatch[1].replace(',', '.')) * 365);
      if (mesesMatch) dias += Math.round(parseFloat(mesesMatch[1].replace(',', '.')) * 30);

      let cd = 16;
      let puesto = 'Auxiliar Administrativo/a';
      if (lineLower.includes('jefe') || lineLower.includes('negociado')) { puesto = 'Jefe/a de Negociado'; cd = 18; }
      else if (lineLower.includes('gestor')) { puesto = 'Gestor/a de Servicios'; cd = 18; }
      else if (lineLower.includes('adscrito')) { puesto = 'Auxiliar Administrativo/a Adscrito/a'; cd = 14; }

      if (dias > 0) {
        findings.experiencia.push({
          puesto,
          administracion: defaultAdmin,
          cd,
          dias,
          tipoPlaza: 'vinculada',
          esEspecificaAmbito: false,
          origenArchivo: filename
        });
      }
    }
  });

  // 6. Análisis línea por línea para CURSOS DE FORMACIÓN
  lines.forEach(line => {
    const lineLower = line.toLowerCase();

    // Ignorar líneas que ya fueron identificadas como experiencia (ej. "Nivel 14 10 años")
    if (lineLower.includes('nivel') && (lineLower.includes('año') || lineLower.includes('mes'))) return;

    // Patrón flexible de horas: "40 horas", "40 h", "40h", "40 hrs", "(40 h)", "40h."
    const horasMatch = line.match(/(?:\b(\d+(?:[.,]\d+)?)\s*(?:horas?|hrs?\.?|créditos?|creditos?)\b|\b(\d+(?:[.,]\d+)?)\s*h(?:\.|\b|\)))/i);
    if (horasMatch) {
      const matchedNumStr = horasMatch[1] || horasMatch[2];
      let horas = parseFloat(matchedNumStr.replace(',', '.'));
      if (horasMatch[0].toLowerCase().includes('crédit') || horasMatch[0].toLowerCase().includes('credit')) {
        horas = horas * 10;
      }

      if (horas > 0 && horas <= 1500) {
        let titulo = line
          .replace(/(?:\b\d+(?:[.,]\d+)?\s*(?:horas?|hrs?\.?|créditos?|creditos?)\b|\b\d+(?:[.,]\d+)?\s*h(?:\.|\b|\)))/gi, '')
          .replace(/\b(?:aprovechamiento|asistencia|superado|apto|impartición|imparticion|docente|horas?)\b/gi, '')
          .replace(/^[-*•\d.)\s:]+/, '')
          .replace(/[,:()\-–—\s]+$/, '')
          .trim();

        if (titulo.length < 3) titulo = 'Curso de formación (' + horas + ' h)';

        let tipo = 'Asistencia';
        if (lineLower.includes('aprovechamiento') || lineLower.includes('apto') || lineLower.includes('superado') || lineLower.includes('impartid') || lineLower.includes('docente')) {
          tipo = 'Aprovechamiento';
        }

        let caracter = 'General / Transversal';
        if (lineLower.includes('especific') || lineLower.includes('específic') || MATERIAS_ESPECIFICAS_KEYWORDS.some(kw => lineLower.includes(kw))) {
          caracter = 'Específico';
        } else if (MATERIAS_GENERALES_KEYWORDS.some(kw => lineLower.includes(kw))) {
          caracter = 'General / Transversal';
        }

        // Limpiar títulos que queden como preposiciones o palabras sueltas
        titulo = titulo.replace(/\s+(?:con|de|en|para|y)\s*$/i, '').trim();
        if (titulo.toLowerCase() === 'específica' || titulo.toLowerCase() === 'especifica') {
          titulo = 'Cursos de Formación Específica';
        } else if (titulo.toLowerCase() === 'transversal' || titulo.toLowerCase() === 'general') {
          titulo = 'Cursos de Formación Transversal / General';
        }

        if (titulo.length < 3) titulo = 'Curso de formación (' + horas + ' h)';

        const yaExiste = findings.cursos.some(c => c.titulo.toLowerCase() === titulo.toLowerCase() && c.horas === horas);
        if (!yaExiste) {
          findings.cursos.push({
            titulo: titulo.charAt(0).toUpperCase() + titulo.slice(1),
            horas,
            tipo,
            caracter,
            esEspecifico: (caracter === 'Específico'),
            incluido: true,
            origenArchivo: filename
          });
        }
      }
    }
  });

  // 7. Detección de Titulaciones Oficiales
  if (/(?:grado|licenciad[oa]|diplomad[oa])\s+en\s+([A-ZÁÉÍÓÚÑa-záéíóúñ\s]+)/i.test(cleanText)) {
    findings.titulaciones.push({
      tipo: 'Grado / Licenciatura / Diplomatura',
      denominacion: 'Título universitario oficial',
      origenArchivo: filename
    });
  }
  if (/técnico\s+superior|ciclo\s+formativo\s+de\s+grado\s+superior|cfgs/i.test(cleanText)) {
    findings.titulaciones.push({
      tipo: 'Ciclo Formativo Grado Superior (CFGS)',
      denominacion: 'Técnico Superior',
      origenArchivo: filename
    });
  }

  // 8. Detección de Idiomas
  const idiomaRegex = /(inglés|ingles|francés|frances|alemán|aleman)[\s\S]{0,30}?\b([ABC][12])\b/gi;
  let idMatch;
  while ((idMatch = idiomaRegex.exec(cleanText)) !== null) {
    findings.idiomas.push({
      idioma: idMatch[1].toUpperCase(),
      nivel: idMatch[2].toUpperCase(),
      origenArchivo: filename
    });
  }

  // Resumen del tipo de documento
  if (findings.cursos.length > 0 && findings.experiencia.length > 0) {
    findings.tipoDocumentoEstimado = `Méritos (${findings.cursos.length} cursos, ${findings.experiencia.length} serv.)`;
  } else if (findings.cursos.length > 0) {
    findings.tipoDocumentoEstimado = `Cursos de formación (${findings.cursos.length})`;
  } else if (findings.experiencia.length > 0) {
    findings.tipoDocumentoEstimado = `Servicios prestados (${findings.experiencia.length})`;
  }

  return findings;
}

module.exports = { extractContentFromBuffer, analyzeTextForMerits };
