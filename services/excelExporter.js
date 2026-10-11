/**
 * Generador de archivos Excel (.xlsx) estructurados y formateados
 * para la baremación oficial del concurso
 */
const XLSX = require('xlsx');

function buildExcelWorkbook(candidateData, calculationResult) {
  const wb = XLSX.utils.book_new();

  // 1. Hoja 1: Resumen de Baremación
  const resumenRows = [
    ["EXCMO. CABILDO INSULAR DE TENERIFE - IASS"],
    ["COMISIÓN PERMANENTE DE VALORACIÓN DE MÉRITOS"],
    ["FICHA OFICIAL DE BAREMACIÓN DE ASPIRANTE"],
    [""],
    ["DATOS DE LA PERSONA ASPIRANTE Y PUESTO"],
    ["Nombre y Apellidos:", candidateData.nombre || "No especificado"],
    ["DNI / NIF:", candidateData.dni || "No especificado"],
    ["Puesto Solicitado:", candidateData.puestoSolicitado ? candidateData.puestoSolicitado.tipo : "No seleccionado"],
    ["Forma de Provisión:", candidateData.puestoSolicitado ? candidateData.puestoSolicitado.formaProvision : ""],
    ["Nivel Complemento Destino (CD):", candidateData.puestoSolicitado ? candidateData.puestoSolicitado.cd : ""],
    ["Fecha de Valoración:", new Date().toLocaleDateString('es-ES')],
    [""],
    ["DESGLOSE DE PUNTUACIONES OBTENIDAS"]
  ];

  if (calculationResult.tipoConcurso === "Concurso ordinario") {
    resumenRows.push(
      ["Apartado de Mérito", "Puntuación Obtenida", "Tope Máximo", "Observaciones"],
      ["a) Méritos específicos", calculationResult.apartados.meritosEspecificos.puntos, calculationResult.apartados.meritosEspecificos.tope, `Cursos: ${calculationResult.apartados.meritosEspecificos.desglose.cursosEspecificos} | Títulos: ${calculationResult.apartados.meritosEspecificos.desglose.titulaciones} | Idiomas: ${calculationResult.apartados.meritosEspecificos.desglose.idiomas}`],
      ["b) Grado personal reconocido", calculationResult.apartados.gradoPersonal.puntos, calculationResult.apartados.gradoPersonal.tope, `Nivel consolidado: ${candidateData.gradoPersonal || 'Mínimo'}`],
      ["c) Trabajo desarrollado", calculationResult.apartados.trabajoDesarrollado.puntos, calculationResult.apartados.trabajoDesarrollado.tope, `Puntos brutos: ${calculationResult.apartados.trabajoDesarrollado.puntosBrutos}`],
      ["d) Cursos formación y perf.", calculationResult.apartados.cursosFormacion.puntos, calculationResult.apartados.cursosFormacion.tope, `Puntos brutos: ${calculationResult.apartados.cursosFormacion.puntosBrutos}`],
      ["e) Antigüedad", calculationResult.apartados.antiguedad.puntos, calculationResult.apartados.antiguedad.tope, `Vinculada: ${calculationResult.apartados.antiguedad.desglose.vinculada} | Otras: ${calculationResult.apartados.antiguedad.desglose.otras}`],
      ["f) Conciliación vida personal/familiar", calculationResult.apartados.conciliacion.puntos, calculationResult.apartados.conciliacion.tope, `Hijos: ${candidateData.conciliacionHijos ? 'Sí (0.5)' : 'No'} | Cónyuge: ${candidateData.conciliacionConyuge ? 'Sí (0.5)' : 'No'}`],
      [""],
      ["PUNTUACIÓN TOTAL FINAL", calculationResult.puntuacionFinal, 10.00, ""],
      ["Puntuación Mínima Exigida", calculationResult.minimoExigido, "", ""],
      ["RESULTADO DE VALORACIÓN", calculationResult.superaMinimo ? "APTO / SUPERA MÍNIMO DE ADJUDICACIÓN" : "NO ALCANZA MÍNIMO", "", ""]
    );
  } else {
    // Concurso específico
    resumenRows.push(
      ["Fase / Apartado", "Puntuación", "Tope", "Mínimo Exigido", "Estado"],
      ["FASE 1: Méritos Generales", calculationResult.fases.fase1.puntos, calculationResult.fases.fase1.tope, calculationResult.fases.fase1.minimoRequerido, calculationResult.fases.fase1.superada ? "SUPERADA" : "NO SUPERADA"],
      ["  - b) Grado personal", calculationResult.fases.fase1.apartados.gradoPersonal.puntos, calculationResult.fases.fase1.apartados.gradoPersonal.tope, "-", ""],
      ["  - c) Trabajo desarrollado", calculationResult.fases.fase1.apartados.trabajoDesarrollado.puntos, calculationResult.fases.fase1.apartados.trabajoDesarrollado.tope, "-", ""],
      ["  - d) Cursos de formación", calculationResult.fases.fase1.apartados.cursosFormacion.puntos, calculationResult.fases.fase1.apartados.cursosFormacion.tope, "-", ""],
      ["  - e) Antigüedad", calculationResult.fases.fase1.apartados.antiguedad.puntos, calculationResult.fases.fase1.apartados.antiguedad.tope, "-", ""],
      ["FASE 2: Méritos Específicos", calculationResult.fases.fase2.puntos, calculationResult.fases.fase2.tope, calculationResult.fases.fase2.minimoRequerido, calculationResult.fases.fase2.superada ? "SUPERADA" : "NO SUPERADA"],
      ["  - Formación específica / títulos / idiomas", calculationResult.fases.fase2.apartados.formacionEspecifica.puntos, calculationResult.fases.fase2.apartados.formacionEspecifica.tope, "-", ""],
      ["  - Experiencia específica en el Servicio", calculationResult.fases.fase2.apartados.experienciaEspecifica.puntos, calculationResult.fases.fase2.apartados.experienciaEspecifica.tope, "-", `Días computados: ${calculationResult.fases.fase2.apartados.experienciaEspecifica.diasComputados}`],
      [""],
      ["PUNTUACIÓN TOTAL FINAL", calculationResult.puntuacionFinal, 10.00, calculationResult.minimoExigido, ""],
      ["RESULTADO FINAL DE BAREMACIÓN", calculationResult.superaMinimo ? "APTO / SUPERA AMBAS FASES Y MÍNIMO GLOBAL" : "NO APTO", "", "", ""]
    );
  }

  const wsResumen = XLSX.utils.aoa_to_sheet(resumenRows);
  XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen_Baremacion");

  // 2. Hoja 2: Detalle de Cursos
  const cursosHeaders = [
    ["DETALLE DE CURSOS DE FORMACIÓN Y PERFECCIONAMIENTO ALEGADOS"],
    [""],
    ["Computado en Baremo", "Título del Curso", "Horas", "Modalidad", "Carácter (Específico / General)", "Factor Aplicado", "Puntos Obtenidos", "Documento Origen"]
  ];
  (calculationResult.cursosDetalle || []).forEach(c => {
    cursosHeaders.push([
      c.incluido !== false ? "SÍ (Incluido)" : "NO (Excluido por usuario)",
      c.titulo || "Sin título",
      c.horas || 0,
      c.tipo || "Asistencia",
      c.caracter || (c.esEspecifico ? "Específico" : "General"),
      c.factorPuntos || 0,
      c.puntosBrutos || 0,
      c.origenArchivo || "Manual"
    ]);
  });
  const wsCursos = XLSX.utils.aoa_to_sheet(cursosHeaders);
  XLSX.utils.book_append_sheet(wb, wsCursos, "Detalle_Cursos");

  // 3. Hoja 3: Detalle de Experiencia / Trabajo Desarrollado
  const expHeaders = [
    ["DETALLE DE SERVICIOS PRESTADOS Y TRABAJO DESARROLLADO"],
    [""],
    ["Denominación del Puesto", "Administración", "Nivel CD", "Días Computados", "Factor por Día", "Puntos Brutos", "Ámbito Específico", "Documento Origen"]
  ];
  (calculationResult.experienciaDetalle || []).forEach(e => {
    expHeaders.push([
      e.puesto || "Auxiliar Administrativo",
      e.administracion || "Cabildo Insular de Tenerife",
      e.cd || 16,
      e.dias || 0,
      e.factor || 0,
      e.puntosBrutos || 0,
      e.esEspecificaAmbito ? "Sí" : "No",
      e.origenArchivo || "Manual"
    ]);
  });
  const wsExp = XLSX.utils.aoa_to_sheet(expHeaders);
  XLSX.utils.book_append_sheet(wb, wsExp, "Detalle_Experiencia");

  // 4. Hoja 4: Otros Méritos
  const otrosHeaders = [
    ["DETALLE DE OTROS MÉRITOS ACREDITADOS"],
    [""],
    ["Categoría", "Descripción / Nivel", "Documento Origen"]
  ];
  (candidateData.titulaciones || []).forEach(t => {
    otrosHeaders.push(["Titulación Académica", `${t.tipo} - ${t.denominacion || ''}`, t.origenArchivo || 'Aportado']);
  });
  (candidateData.idiomas || []).forEach(i => {
    otrosHeaders.push(["Idioma Oficial", `${i.idioma} - Nivel ${i.nivel}`, i.origenArchivo || 'Aportado']);
  });
  otrosHeaders.push(["Grado Personal", `Nivel consolidado: ${candidateData.gradoPersonal || 'No acreditado'}`, "Declarado / Acreditado"]);
  otrosHeaders.push(["Antigüedad en plaza", `${candidateData.antiguedadVinculadaDias || 0} días`, "Acreditado"]);
  otrosHeaders.push(["Antigüedad en otras plazas", `${candidateData.antiguedadOtrasDias || 0} días`, "Acreditado"]);
  if (candidateData.conciliacionHijos) otrosHeaders.push(["Conciliación", "Cuidado de hijos menores de 12 años", "Acreditado"]);
  if (candidateData.conciliacionConyuge) otrosHeaders.push(["Conciliación", "Destino previo de cónyuge en distinto municipio", "Acreditado"]);

  const wsOtros = XLSX.utils.aoa_to_sheet(otrosHeaders);
  XLSX.utils.book_append_sheet(wb, wsOtros, "Otros_Meritos");

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function buildRankingExcelWorkbook(rankingData) {
  const wb = XLSX.utils.book_new();
  const { puesto, dotaciones, ranking } = rankingData;
  const isEsp = puesto.formaProvision === 'Concurso específico';

  const rows = [
    ["EXCMO. CABILDO INSULAR DE TENERIFE - IASS"],
    ["COMISIÓN PERMANENTE DE VALORACIÓN DE MÉRITOS"],
    ["PROPUESTA DE CLASIFICACIÓN Y ADJUDICACIÓN DE PUESTOS"],
    [""],
    ["Código RPT:", puesto.codigoRpt || puesto.id || "No especificado"],
    ["Puesto Convocado:", puesto.tipo],
    ["Servicio / Unidad:", `${puesto.servicio || ''}${puesto.unidad ? ' (' + puesto.unidad + ')' : ''}`],
    ["Localización Geográfica:", puesto.localizacion || 'No especificada'],
    ["Forma de Provisión:", puesto.formaProvision],
    ["Nivel CD / CE:", `CD: ${puesto.cd} / CE: ${puesto.ce}`],
    ["Dotaciones / Vacantes:", dotaciones],
    ["Fecha de Publicación:", new Date().toLocaleDateString('es-ES')],
    [""],
    [
      "Nº Orden",
      "DNI / NIE",
      "Apellidos y Nombre",
      "Preferencia Solicitada",
      "Puntuación Final",
      "Estado Adjudicación",
      isEsp ? "1º Desempate (Fase 2)" : "1º Desempate (Esp.)",
      "2º Desempate (Grado)",
      "3º Desempate (Trabajo)",
      "4º Desempate (Cursos)",
      "5º Desempate (Antigüedad)"
    ]
  ];

  ranking.forEach(r => {
    rows.push([
      r.orden,
      r.dni,
      r.nombre,
      r.ordenPreferencia ? `${r.ordenPreferencia}ª opción` : '1ª opción',
      r.puntuacionFinal,
      r.estadoAdjudicacion === 'RESERVA' ? `RESERVA (Nº ${r.ordenReserva || 1})${r.detalleEstado ? ' - ' + r.detalleEstado : ''}` : r.estadoAdjudicacion,
      isEsp ? (r.desempate.fase2 || 0) : (r.desempate.meritosEspecificos || 0),
      r.desempate.grado || 0,
      r.desempate.trabajo || 0,
      r.desempate.cursos || 0,
      r.desempate.antiguedad || 0
    ]);
  });

  const wsRanking = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, wsRanking, "Propuesta_Adjudicacion");

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function enmascararDniExcel(dni) {
  if (!dni) return '***0000**';
  const clean = dni.trim().toUpperCase();
  if (clean.length === 9) {
    return `***${clean.substring(3, 7)}**`;
  }
  const mid = Math.floor(clean.length / 2);
  return `***${clean.substring(Math.max(0, mid - 2), Math.min(clean.length, mid + 2))}**`;
}

function buildAnonimizedRankingExcelWorkbook(rankingData) {
  const { puesto, ranking, dotaciones, totalAspirantes } = rankingData;
  const wb = XLSX.utils.book_new();
  const isEsp = puesto.formaProvision === 'Concurso específico';

  const rows = [
    ["EXCMO. CABILDO INSULAR DE TENERIFE - IASS"],
    ["COMISIÓN PERMANENTE DE VALORACIÓN • TRIBUNAL CALIFICADOR"],
    ["LISTADO OFICIAL DE VALORACIÓN Y CLASIFICACIÓN (PUBLICACIÓN TABLÓN / SEDE ELECTRÓNICA - LOPDGDD)"],
    [""],
    ["Código RPT:", puesto.codigoRpt || puesto.id],
    ["Denominación:", puesto.tipo],
    ["Servicio / Unidad:", `${puesto.servicio || ''}${puesto.unidad ? ' (' + puesto.unidad + ')' : ''}`],
    ["Localización:", puesto.localizacion || 'Santa Cruz de Tenerife'],
    ["Dotaciones Convocadas:", dotaciones],
    ["Fecha de Publicación:", new Date().toLocaleDateString('es-ES')],
    ["Aviso Legal:", "Publicación anonimizada conforme a la Disposición Adicional Séptima de la Ley Orgánica 3/2018 (LOPDGDD)"],
    [""],
    [
      "Nº Prelación",
      "DNI Anonimizado",
      "Apellidos y Nombre",
      "Preferencia Opción",
      "Puntuación Total",
      "Propuesta Oficial",
      isEsp ? "1º Específicos" : "1º Específicos",
      "2º Grado Personal",
      "3º Trabajo Desarrollado",
      "4º Cursos Formación",
      "5º Antigüedad"
    ]
  ];

  ranking.forEach(r => {
    rows.push([
      r.orden,
      enmascararDniExcel(r.dni),
      r.nombre,
      r.ordenPreferencia ? `${r.ordenPreferencia}ª opción` : '1ª opción',
      r.puntuacionFinal,
      r.estadoAdjudicacion === 'RESERVA' ? `RESERVA (Nº ${r.ordenReserva || 1})` : r.estadoAdjudicacion,
      isEsp ? (r.desempate.fase2 || 0) : (r.desempate.meritosEspecificos || 0),
      r.desempate.grado || 0,
      r.desempate.trabajo || 0,
      r.desempate.cursos || 0,
      r.desempate.antiguedad || 0
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Listado_Oficial_Tablon");
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { 
  buildExcelWorkbook, 
  buildRankingExcelWorkbook,
  buildAnonimizedRankingExcelWorkbook 
};

