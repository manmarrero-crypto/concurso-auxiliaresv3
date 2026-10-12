#!/usr/bin/env node
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { extractContentFromBuffer, analyzeTextForMerits } = require('./services/documentParser');
const { calculateScore } = require('./services/calculator');
const { buildExcelWorkbook, buildRankingExcelWorkbook, buildAnonimizedRankingExcelWorkbook } = require('./services/excelExporter');
const { buildActaWordDocument, buildNotificacionIndividualWordDocument } = require('./services/wordExporter');
const { getAllAspirantes, saveAspirante, deleteAspirante } = require('./data/storage');
const { computeRankingForPuesto, computeGlobalStatistics } = require('./services/adjudicationService');
const { 
  parseExcelImport, 
  parseWordImport, 
  parsePdfImport, 
  generateCandidateDiff, 
  mergeAspiranteDeOficio, 
  generateExcelTemplate 
} = require('./services/bulkImportService');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Health check para Render y monitorización
app.get('/health', (req, res) => res.status(200).send('OK'));

// Multer storage en memoria para no dejar residuos en disco
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 } // Hasta 30MB por archivo
});

// Catálogo de puestos
app.get('/api/puestos', (req, res) => {
  try {
    const puestosPath = path.join(__dirname, 'data', 'puestos.json');
    const data = fs.readFileSync(puestosPath, 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    res.status(500).json({ error: 'Error al cargar el catálogo de puestos' });
  }
});

// Añadir / Ofertar nuevo puesto en el catálogo (Ordinario, 1ª Resultas o 2ª Resultas)
app.post('/api/puestos', (req, res) => {
  try {
    const puestosPath = path.join(__dirname, 'data', 'puestos.json');
    const puestos = JSON.parse(fs.readFileSync(puestosPath, 'utf8'));
    const nuevo = req.body;

    if (!nuevo.codigoRpt && !nuevo.id) {
      return res.status(400).json({ error: 'Se requiere Código RPT del puesto' });
    }

    const cod = (nuevo.codigoRpt || nuevo.id).toUpperCase().trim();
    const puestoFinal = {
      id: cod,
      codigoRpt: cod,
      tipo: nuevo.tipo || 'Auxiliar Administrativo/a',
      formaProvision: nuevo.formaProvision || 'Concurso ordinario',
      cd: parseInt(nuevo.cd, 10) || 16,
      ce: parseInt(nuevo.ce, 10) || 28,
      dotaciones: parseInt(nuevo.dotaciones, 10) || 1,
      consejeria: nuevo.consejeria || 'Cabildo Insular de Tenerife',
      entidad: nuevo.entidad || 'Cabildo de Tenerife',
      servicio: nuevo.servicio || 'Servicio General',
      unidad: nuevo.unidad || '',
      localizacion: nuevo.localizacion || 'Zona metropolitana Santa Cruz de Tenerife- La Laguna',
      requisitoExperiencia: nuevo.requisitoExperiencia || '18 meses en Administración Pública',
      minimoSuperar: nuevo.formaProvision === 'Concurso específico' ? 4 : 1.5,
      esPuestoUnico: !!nuevo.esPuestoUnico,
      faseOferta: nuevo.faseOferta || 'ordinaria', // 'ordinaria' | '1a_resultas' | '2a_resultas'
      liberadoPor: nuevo.liberadoPor || null,
      descripcion: `${nuevo.servicio || 'Servicio'} [${nuevo.localizacion || 'S/C'}]`,
      denominacionLarga: `[${cod}] ${nuevo.tipo || 'Auxiliar'} - ${nuevo.servicio || 'Servicio'} (${nuevo.localizacion || 'S/C'})`
    };

    const existIdx = puestos.findIndex(p => (p.codigoRpt || p.id).toUpperCase() === cod);
    if (existIdx >= 0) {
      puestos[existIdx] = { ...puestos[existIdx], ...puestoFinal };
    } else {
      puestos.push(puestoFinal);
    }

    fs.writeFileSync(puestosPath, JSON.stringify(puestos, null, 2), 'utf8');
    res.json({ success: true, puesto: puestoFinal, total: puestos.length });
  } catch (error) {
    res.status(500).json({ error: 'Error al añadir puesto: ' + error.message });
  }
});

// Incorporar al catálogo una plaza liberada por un funcionario definitivo
app.post('/api/puestos/incorporar-liberado', (req, res) => {
  try {
    const puestosPath = path.join(__dirname, 'data', 'puestos.json');
    const puestos = JSON.parse(fs.readFileSync(puestosPath, 'utf8'));
    const plaza = req.body.plazaLiberada || req.body;

    const cod = (plaza.codigoRpt || plaza.id || `RES-${Date.now()}`).toUpperCase().trim();
    const existIdx = puestos.findIndex(p => (p.codigoRpt || p.id).toUpperCase() === cod);

    const puestoFinal = {
      id: cod,
      codigoRpt: cod,
      tipo: plaza.tipo || 'Auxiliar Administrativo/a',
      formaProvision: plaza.formaProvision || 'Concurso ordinario',
      cd: parseInt(plaza.cd, 10) || 16,
      ce: parseInt(plaza.ce, 10) || 28,
      dotaciones: 1,
      consejeria: plaza.consejeria || 'Cabildo Insular de Tenerife',
      entidad: plaza.entidad || 'Cabildo de Tenerife',
      servicio: plaza.servicio || 'Servicio procedente de resulta',
      unidad: plaza.unidad || '',
      localizacion: plaza.localizacion || 'Zona metropolitana Santa Cruz de Tenerife- La Laguna',
      requisitoExperiencia: '18 meses en la Subescala Administrativa',
      minimoSuperar: plaza.formaProvision === 'Concurso específico' ? 4 : 1.5,
      esPuestoUnico: false,
      faseOferta: plaza.faseLiberacion === '2ª Resultas' ? '2a_resultas' : '1a_resultas',
      liberadoPor: plaza.liberadoPor || plaza.origenAspirante || 'Titular definitivo',
      dniLiberador: plaza.dniLiberador || plaza.dniAspirante || '',
      descripcion: `Plaza resulta liberada por ${plaza.liberadoPor || 'titular'} (${plaza.servicio || 'Servicio'})`,
      denominacionLarga: `[${cod}] ${plaza.tipo || 'Auxiliar'} - ${plaza.servicio || 'Servicio'} [Oferta en ${plaza.faseLiberacion || 'Resultas'}]`
    };

    if (existIdx >= 0) {
      puestos[existIdx] = { ...puestos[existIdx], ...puestoFinal };
    } else {
      puestos.unshift(puestoFinal);
    }

    fs.writeFileSync(puestosPath, JSON.stringify(puestos, null, 2), 'utf8');
    res.json({ success: true, puesto: puestoFinal, total: puestos.length });
  } catch (error) {
    res.status(500).json({ error: 'Error al incorporar plaza liberada: ' + error.message });
  }
});

// Aspirantes persistidos
app.get('/api/aspirantes', (req, res) => {
  try {
    const list = getAllAspirantes();
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener aspirantes: ' + error.message });
  }
});

app.post('/api/aspirantes', (req, res) => {
  try {
    const aspirante = req.body;
    if (!aspirante.dni && !aspirante.nombre) {
      return res.status(400).json({ error: 'El aspirante debe tener DNI o Nombre' });
    }
    const guardado = saveAspirante(aspirante);
    res.json({ success: true, aspirante: guardado });
  } catch (error) {
    res.status(500).json({ error: 'Error al guardar aspirante: ' + error.message });
  }
});

app.delete('/api/aspirantes/:id', (req, res) => {
  try {
    const success = deleteAspirante(req.params.id);
    res.json({ success });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar aspirante: ' + error.message });
  }
});

// Cuadro de clasificación y adjudicación de un puesto
app.get('/api/clasificacion/:puestoId', (req, res) => {
  try {
    const puestosPath = path.join(__dirname, 'data', 'puestos.json');
    const puestos = JSON.parse(fs.readFileSync(puestosPath, 'utf8'));
    const puesto = puestos.find(p => p.id === req.params.puestoId || p.codigoRpt === req.params.puestoId || p.tipo === req.params.puestoId);

    if (!puesto) {
      return res.status(404).json({ error: 'Puesto no encontrado' });
    }

    const aspirantes = getAllAspirantes();
    const resultadoRanking = computeRankingForPuesto(puesto, aspirantes, puestos);
    res.json(resultadoRanking);
  } catch (error) {
    res.status(500).json({ error: 'Error al calcular clasificación: ' + error.message });
  }
});

// Cuadro de mando y estadísticas globales de solicitudes y demanda
app.get('/api/estadisticas-globales', (req, res) => {
  try {
    const puestosPath = path.join(__dirname, 'data', 'puestos.json');
    const puestos = JSON.parse(fs.readFileSync(puestosPath, 'utf8'));
    const aspirantes = getAllAspirantes();
    const stats = computeGlobalStatistics(aspirantes, puestos);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Error al calcular estadísticas globales: ' + error.message });
  }
});

// Cargar candidatos de muestra / simulación para ver adjudicaciones y listas de reserva
app.post('/api/aspirantes/cargar-muestra', (req, res) => {
  try {
    const puestosPath = path.join(__dirname, 'data', 'puestos.json');
    const puestos = JSON.parse(fs.readFileSync(puestosPath, 'utf8'));
    const p1 = puestos.find(p => p.codigoRpt === 'FC1843') || puestos[0];
    const p2 = puestos.find(p => p.codigoRpt === 'FC1897') || puestos[1];
    const p3 = puestos.find(p => p.codigoRpt === 'FC1808') || puestos[2];

    const muestras = [
      {
        id: '23456789A',
        dni: '23456789A',
        nombre: 'Carmen Rosa Morales Delgado',
        situacionAdministrativa: 'definitiva',
        puestoOrigen: 'FC1843 / Auxiliar Adm. Proyectos Estratégicos',
        participaResultas: false,
        puestosSolicitados: [
          { ...p1, orden: 1 },
          { ...p2, orden: 2 }
        ],
        puestoSolicitado: p1,
        gradoPersonal: '18',
        conciliacionHijos: true,
        conciliacionConyuge: false,
        antiguedadVinculadaDias: 5475, // 15 años
        antiguedadOtrasDias: 365,
        merits: {
          cursos: [
            { titulo: 'Gestión Administrativa y Expedientes Electrónicos', horas: 120, tipo: 'Aprovechamiento', caracter: 'Específico', esEspecifico: true, incluido: true },
            { titulo: 'Procedimiento Administrativo Común', horas: 80, tipo: 'Aprovechamiento', caracter: 'Específico', esEspecifico: true, incluido: true },
            { titulo: 'Prevención de Riesgos Laborales', horas: 60, tipo: 'Aprovechamiento', caracter: 'General / Transversal', esEspecifico: false, incluido: true }
          ],
          experiencia: [
            { puesto: 'Auxiliar Administrativo/a', administracion: 'Cabildo de Tenerife', cd: 16, dias: 3650, tipoPlaza: 'vinculada', esEspecificaAmbito: true },
            { puesto: 'Auxiliar Administrativo/a Adscrito/a', administracion: 'Cabildo de Tenerife', cd: 14, dias: 1825, tipoPlaza: 'vinculada', esEspecificaAmbito: false }
          ],
          titulaciones: [
            { tipo: 'Grado / Licenciatura / Diplomatura', denominacion: 'Diplomatura en Gestión Pública' }
          ],
          idiomas: [
            { idioma: 'INGLÉS', nivel: 'B2' }
          ],
          antiguedadVinculadaDias: 5475,
          antiguedadOtrasDias: 365
        }
      },
      {
        id: '34567890B',
        dni: '34567890B',
        nombre: 'Francisco Javier Santana Hernández',
        situacionAdministrativa: 'definitiva',
        puestoOrigen: 'FC1808 / Auxiliar Adm. Carreteras',
        participaResultas: true,
        puestosSolicitados: [
          { ...p1, orden: 1 },
          { ...p3, orden: 2 }
        ],
        puestoSolicitado: p1,
        gradoPersonal: '16',
        conciliacionHijos: false,
        conciliacionConyuge: true,
        antiguedadVinculadaDias: 3650, // 10 años
        antiguedadOtrasDias: 0,
        merits: {
          cursos: [
            { titulo: 'Ofimática Avanzada y Herramientas Digitales', horas: 60, tipo: 'Aprovechamiento', caracter: 'Específico', esEspecifico: true, incluido: true },
            { titulo: 'Transparencia y Buen Gobierno', horas: 40, tipo: 'Asistencia', caracter: 'General / Transversal', esEspecifico: false, incluido: true }
          ],
          experiencia: [
            { puesto: 'Auxiliar Administrativo/a', administracion: 'Cabildo de Tenerife', cd: 16, dias: 3650, tipoPlaza: 'vinculada', esEspecificaAmbito: false }
          ],
          titulaciones: [
            { tipo: 'Ciclo Formativo Grado Superior (CFGS)', denominacion: 'Técnico Superior en Administración y Finanzas' }
          ],
          idiomas: [],
          antiguedadVinculadaDias: 3650,
          antiguedadOtrasDias: 0
        }
      },
      {
        id: '45678901C',
        dni: '45678901C',
        nombre: 'Beatriz Reyes Cabrera',
        situacionAdministrativa: 'definitiva',
        puestoOrigen: 'FC1897 / Gestor de Contenidos Digitales',
        participaResultas: true,
        puestosSolicitados: [
          { ...p2, orden: 1 },
          { ...p1, orden: 2 }
        ],
        puestoSolicitado: p2,
        gradoPersonal: '16',
        conciliacionHijos: false,
        conciliacionConyuge: false,
        antiguedadVinculadaDias: 2555, // 7 años
        antiguedadOtrasDias: 730,
        merits: {
          cursos: [
            { titulo: 'Atención a la Ciudadanía y Canales Digitales', horas: 100, tipo: 'Aprovechamiento', caracter: 'Específico', esEspecifico: true, incluido: true },
            { titulo: 'Igualdad de Género en la Administración', horas: 50, tipo: 'Aprovechamiento', caracter: 'General / Transversal', esEspecifico: false, incluido: true }
          ],
          experiencia: [
            { puesto: 'Gestor/a de Servicios', administracion: 'Cabildo de Tenerife', cd: 18, dias: 1500, tipoPlaza: 'vinculada', esEspecificaAmbito: true },
            { puesto: 'Auxiliar Administrativo/a', administracion: 'Cabildo de Tenerife', cd: 16, dias: 1055, tipoPlaza: 'vinculada', esEspecificaAmbito: false }
          ],
          titulaciones: [],
          idiomas: [
            { idioma: 'INGLÉS', nivel: 'B1' }
          ],
          antiguedadVinculadaDias: 2555,
          antiguedadOtrasDias: 730
        }
      },
      {
        id: '56789012D',
        dni: '56789012D',
        nombre: 'Elena Torres Medina',
        situacionAdministrativa: 'provisional',
        puestoOrigen: 'Adscripción Provisional - Interinidad Cabildo',
        participaResultas: true,
        puestosSolicitados: [
          { ...p1, orden: 1 },
          { ...p3, orden: 2 }
        ],
        puestoSolicitado: p1,
        gradoPersonal: '14',
        conciliacionHijos: true,
        conciliacionConyuge: false,
        antiguedadVinculadaDias: 1460, // 4 años
        antiguedadOtrasDias: 365,
        merits: {
          cursos: [
            { titulo: 'Procedimiento Electrónico y Notificaciones', horas: 40, tipo: 'Aprovechamiento', caracter: 'Específico', esEspecifico: true, incluido: true },
            { titulo: 'Protección de Datos en la Administración Pública', horas: 30, tipo: 'Aprovechamiento', caracter: 'General / Transversal', esEspecifico: false, incluido: true }
          ],
          experiencia: [
            { puesto: 'Auxiliar Administrativo/a', administracion: 'Cabildo de Tenerife', cd: 14, dias: 1460, tipoPlaza: 'vinculada', esEspecificaAmbito: false }
          ],
          titulaciones: [],
          idiomas: [
            { idioma: 'FRANCÉS', nivel: 'B2' }
          ],
          antiguedadVinculadaDias: 1460,
          antiguedadOtrasDias: 365
        }
      }
    ];

    muestras.forEach(m => saveAspirante(m));
    const listaActualizada = getAllAspirantes();
    res.json({ success: true, totalAspirantes: listaActualizada.length, mensaje: 'Candidatos de muestra incorporados con éxito' });
  } catch (error) {
    res.status(500).json({ error: 'Error cargando candidatos de muestra: ' + error.message });
  }
});

// Exportación del Cuadro de Clasificación / Acta a Excel
app.post('/api/export-ranking-excel', (req, res) => {
  try {
    const { rankingData } = req.body;
    if (!rankingData || !rankingData.puesto || !rankingData.ranking) {
      return res.status(400).json({ error: 'Faltan datos de clasificación para exportar' });
    }

    const buffer = buildRankingExcelWorkbook(rankingData);
    const nombrePuestoLimpio = rankingData.puesto.tipo.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `Acta_Adjudicacion_${nombrePuestoLimpio}_Cabildo.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: 'Error al exportar ranking a Excel: ' + error.message });
  }
});

// Procesamiento de documentos (PDF / Word)
app.post('/api/upload-document', upload.array('documentos', 15), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No se ha subido ningún archivo' });
    }

    const processedResults = [];

    for (const file of req.files) {
      try {
        const extracted = await extractContentFromBuffer(file.buffer, file.mimetype, file.originalname);
        const analysis = analyzeTextForMerits(extracted.text, file.originalname, extracted.html);
        processedResults.push({
          success: true,
          archivo: file.originalname,
          size: file.size,
          ...analysis
        });
      } catch (err) {
        processedResults.push({
          success: false,
          archivo: file.originalname,
          error: 'No se pudo leer el archivo: ' + err.message
        });
      }
    }

    res.json({
      total: processedResults.length,
      resultados: processedResults
    });
  } catch (error) {
    res.status(500).json({ error: 'Error procesando los documentos: ' + error.message });
  }
});

// Escaneo directo de una carpeta local en el ordenador
app.post('/api/scan-folder', async (req, res) => {
  try {
    const { folderPath } = req.body;
    if (!folderPath || !fs.existsSync(folderPath)) {
      return res.status(400).json({ error: 'La ruta de la carpeta no existe o no es accesible' });
    }

    const files = fs.readdirSync(folderPath);
    const validExtensions = ['.pdf', '.docx', '.doc', '.txt'];
    const matchingFiles = files.filter(f => validExtensions.includes(path.extname(f).toLowerCase()));

    if (matchingFiles.length === 0) {
      return res.json({ total: 0, resultados: [], mensaje: 'No se encontraron archivos PDF o Word en la carpeta especificada' });
    }

    const processedResults = [];
    for (const fileName of matchingFiles) {
      const fullPath = path.join(folderPath, fileName);
      try {
        const buffer = fs.readFileSync(fullPath);
        const mimetype = fileName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        const extracted = await extractContentFromBuffer(buffer, mimetype, fileName);
        const analysis = analyzeTextForMerits(extracted.text, fileName, extracted.html);
        processedResults.push({
          success: true,
          archivo: fileName,
          rutaCompleta: fullPath,
          size: buffer.length,
          ...analysis
        });
      } catch (err) {
        processedResults.push({
          success: false,
          archivo: fileName,
          error: 'Error al leer archivo: ' + err.message
        });
      }
    }

    res.json({
      total: processedResults.length,
      resultados: processedResults
    });
  } catch (error) {
    res.status(500).json({ error: 'Error escaneando la carpeta: ' + error.message });
  }
});

// Cálculo del baremo individual
app.post('/api/calculate', (req, res) => {
  try {
    const { candidateData, merits } = req.body;
    if (!candidateData) {
      return res.status(400).json({ error: 'Faltan los datos del candidato' });
    }
    const result = calculateScore(candidateData, merits || {});
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Error en el cálculo: ' + error.message });
  }
});

// Exportación individual a Excel
app.post('/api/export-excel', (req, res) => {
  try {
    const { candidateData, calculationResult } = req.body;
    if (!candidateData || !calculationResult) {
      return res.status(400).json({ error: 'Faltan datos para exportar a Excel' });
    }

    const buffer = buildExcelWorkbook(candidateData, calculationResult);
    const filename = `Baremacion_${(candidateData.dni || 'Aspirante').replace(/[^a-zA-Z0-9]/g, '_')}_Cabildo.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: 'Error al exportar Excel: ' + error.message });
  }
});

// Exportación del Cuadro de Clasificación Anonimizado a Excel (LOPDGDD)
app.post('/api/export-ranking-anonimizado-excel', (req, res) => {
  try {
    const { rankingData } = req.body;
    if (!rankingData || !rankingData.puesto || !rankingData.ranking) {
      return res.status(400).json({ error: 'Faltan datos de clasificación para exportar' });
    }

    const buffer = buildAnonimizedRankingExcelWorkbook(rankingData);
    const cod = (rankingData.puesto.codigoRpt || rankingData.puesto.id || 'Puesto').replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `Listado_Oficial_Tablon_LOPD_${cod}_Cabildo.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: 'Error al exportar Excel anonimizado: ' + error.message });
  }
});

// Exportación del Acta Oficial del Tribunal a Word (.doc / OpenXML)
app.post('/api/export-acta-word', (req, res) => {
  try {
    const { datosActa, rankingData } = req.body;
    if (!rankingData || !rankingData.puesto || !rankingData.ranking) {
      return res.status(400).json({ error: 'Faltan datos para redactar el Acta Oficial' });
    }

    const buffer = buildActaWordDocument(datosActa || {}, rankingData);
    const cod = (rankingData.puesto.codigoRpt || rankingData.puesto.id || 'Puesto').replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `Acta_Tribunal_Adjudicacion_${cod}_Cabildo.doc`;

    res.setHeader('Content-Type', 'application/msword; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: 'Error al generar Acta Oficial en Word: ' + error.message });
  }
});

// Exportación de Ficha Individual de Notificación a Word
app.post('/api/export-notificacion-word', (req, res) => {
  try {
    const { candidateData, calculationResult } = req.body;
    if (!candidateData || !calculationResult) {
      return res.status(400).json({ error: 'Faltan datos del candidato para generar la notificación' });
    }

    const buffer = buildNotificacionIndividualWordDocument(candidateData, calculationResult);
    const dni = (candidateData.dni || 'Aspirante').replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `Notificacion_Individual_Baremacion_${dni}_Cabildo.doc`;

    res.setHeader('Content-Type', 'application/msword; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: 'Error al generar Notificación en Word: ' + error.message });
  }
});

// Descargar Copia de Seguridad completa (Backup)
app.get('/api/backup', (req, res) => {
  try {
    const puestosPath = path.join(__dirname, 'data', 'puestos.json');
    const puestos = fs.existsSync(puestosPath) ? JSON.parse(fs.readFileSync(puestosPath, 'utf8')) : [];
    const aspirantes = getAllAspirantes();

    const backupData = {
      version: '1.0.0',
      tipo: 'Copia de Seguridad Oficial - Concurso Auxiliares Cabildo de Tenerife',
      fecha: new Date().toISOString(),
      fechaLegible: new Date().toLocaleString('es-ES'),
      totalPuestos: puestos.length,
      totalAspirantes: aspirantes.length,
      puestos,
      aspirantes
    };

    const d = new Date();
    const timestamp = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
    const filename = `Backup_Concurso_Auxiliares_${timestamp}.json`;

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(backupData, null, 2));
  } catch (error) {
    res.status(500).json({ error: 'Error al generar copia de seguridad: ' + error.message });
  }
});

// ==========================================
// RUTAS DE IMPORTACIÓN MASIVA Y DE OFICIO
// ==========================================

// Descargar Plantilla Oficial Excel para Importación Masiva
app.get('/api/import/template', (req, res) => {
  try {
    const puestosPath = path.join(__dirname, 'data', 'puestos.json');
    const puestosCatalogo = JSON.parse(fs.readFileSync(puestosPath, 'utf8'));
    const buffer = generateExcelTemplate(puestosCatalogo);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Plantilla_Importacion_Concurso_Auxiliares.xlsx"');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: 'Error al generar la plantilla: ' + error.message });
  }
});

// Analizar archivo subido (Excel, Word, PDF) y previsualizar cambios / conflictos pormenorizados
app.post('/api/import/preview', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se ha subido ningún archivo' });
    }

    const puestosPath = path.join(__dirname, 'data', 'puestos.json');
    const puestosCatalogo = JSON.parse(fs.readFileSync(puestosPath, 'utf8'));
    const filename = req.file.originalname || 'documento';
    const ext = path.extname(filename).toLowerCase();

    let parseResult;
    if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
      parseResult = parseExcelImport(req.file.buffer, puestosCatalogo);
    } else if (ext === '.docx' || ext === '.doc') {
      parseResult = await parseWordImport(req.file.buffer, puestosCatalogo);
    } else if (ext === '.pdf') {
      parseResult = await parsePdfImport(req.file.buffer, puestosCatalogo);
    } else {
      return res.status(400).json({ error: 'Formato no soportado. Sube un archivo Excel (.xlsx, .xls, .csv), Word (.docx, .doc) o PDF (.pdf)' });
    }

    const candidatosDetectados = parseResult.candidatos || [];
    if (candidatosDetectados.length === 0) {
      return res.json({
        success: false,
        mensaje: 'No se detectaron aspirantes ni registros válidos en el documento proporcionado.',
        totalDetectados: 0,
        candidatosNuevos: [],
        candidatosExistentes: []
      });
    }

    const listaExistentes = getAllAspirantes();
    const nuevos = [];
    const existentes = [];

    for (const cand of candidatosDetectados) {
      // Calcular puntuación provisional si tiene puesto
      if (cand.puestoSolicitado) {
        try {
          cand.resultadoCalculo = calculateScore(cand, cand.merits || {});
        } catch (e) {}
      }

      const matchExistente = listaExistentes.find(a => 
        (a.dni && a.dni.toUpperCase() === cand.dni.toUpperCase()) ||
        (a.id && a.id.toUpperCase() === cand.id.toUpperCase())
      );

      if (matchExistente) {
        const diff = generateCandidateDiff(matchExistente, cand);
        existentes.push({
          aspiranteImportado: cand,
          aspiranteActual: matchExistente,
          diff
        });
      } else {
        nuevos.push(cand);
      }
    }

    res.json({
      success: true,
      archivo: filename,
      totalDetectados: candidatosDetectados.length,
      totalNuevos: nuevos.length,
      totalExistentes: existentes.length,
      totalConConflicto: existentes.filter(e => e.diff.hasConflicts).length,
      candidatosNuevos: nuevos,
      candidatosExistentes: existentes,
      totalCursosOficio: parseResult.totalCursosOficio || 0,
      totalExperienciaOficio: parseResult.totalExperienciaOficio || 0
    });
  } catch (error) {
    console.error('Error en previsualización de importación:', error);
    res.status(500).json({ error: 'Error al analizar el archivo: ' + error.message });
  }
});

// Confirmar y aplicar la importación masiva con las resoluciones pormenorizadas
app.post('/api/import/confirm', (req, res) => {
  try {
    const { candidatosNuevos = [], resolucionesExistentes = [] } = req.body;
    let guardadosNuevos = 0;
    let actualizados = 0;
    let omitidos = 0;

    // 1. Guardar candidatos completamente nuevos
    for (const nuevo of candidatosNuevos) {
      if (nuevo.puestoSolicitado) {
        try {
          nuevo.resultadoCalculo = calculateScore(nuevo, nuevo.merits || {});
        } catch (e) {}
      }
      saveAspirante(nuevo);
      guardadosNuevos++;
    }

    // 2. Procesar resoluciones para candidatos existentes
    const listaExistentes = getAllAspirantes();
    for (const resItem of resolucionesExistentes) {
      const { dni, accion, aspiranteImportado } = resItem;
      const actual = listaExistentes.find(a => a.dni && a.dni.toUpperCase() === (dni || '').toUpperCase());

      if (!actual) continue;

      if (accion === 'sobrescribir') {
        const aGuardar = { ...aspiranteImportado, id: actual.id, dni: actual.dni };
        if (aGuardar.puestoSolicitado) {
          try {
            aGuardar.resultadoCalculo = calculateScore(aGuardar, aGuardar.merits || {});
          } catch (e) {}
        }
        saveAspirante(aGuardar);
        actualizados++;
      } else if (accion === 'fusionar_oficio') {
        const fusionado = mergeAspiranteDeOficio(actual, aspiranteImportado);
        saveAspirante(fusionado);
        actualizados++;
      } else if (accion === 'omitir') {
        omitidos++;
      }
    }

    const totalActual = getAllAspirantes().length;
    res.json({
      success: true,
      guardadosNuevos,
      actualizados,
      omitidos,
      totalActual,
      mensaje: `Importación completada con éxito: ${guardadosNuevos} creados, ${actualizados} actualizados, ${omitidos} omitidos.`
    });
  } catch (error) {
    console.error('Error al confirmar importación:', error);
    res.status(500).json({ error: 'Error al confirmar importación: ' + error.message });
  }
});

// Restaurar copia de seguridad
app.post('/api/restore', (req, res) => {
  try {
    const { aspirantes, puestos } = req.body;
    if (!Array.isArray(aspirantes)) {
      return res.status(400).json({ error: 'El archivo de copia de seguridad no contiene una lista válida de aspirantes' });
    }

    const aspirantesPath = path.join(__dirname, 'data', 'aspirantes.json');
    fs.writeFileSync(aspirantesPath, JSON.stringify(aspirantes, null, 2), 'utf8');

    if (Array.isArray(puestos) && puestos.length > 0) {
      const puestosPath = path.join(__dirname, 'data', 'puestos.json');
      fs.writeFileSync(puestosPath, JSON.stringify(puestos, null, 2), 'utf8');
    }

    res.json({
      success: true,
      mensaje: `Copia de seguridad restaurada con éxito: ${aspirantes.length} aspirantes y ${puestos ? puestos.length : 0} puestos.`,
      totalAspirantes: aspirantes.length
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al restaurar copia de seguridad: ' + error.message });
  }
});

const HOST = '0.0.0.0';
const server = app.listen(PORT, HOST, () => {
  console.log(`=======================================================`);
  console.log(`  APLICACIÓN DE BAREMACIÓN Y ADJUDICACIÓN DE CONCURSO`);
  console.log(`  Cabildo Insular de Tenerife / IASS`);
  console.log(`  Servidor activo en: http://${HOST}:${PORT}`);
  console.log(`=======================================================`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const ALT_PORT = PORT + 1;
    app.listen(ALT_PORT, () => {
      console.log(`Puerto ${PORT} ocupado. Servidor iniciado en: http://localhost:${ALT_PORT}`);
    });
  } else {
    console.error('Error al iniciar servidor:', err);
  }
});
