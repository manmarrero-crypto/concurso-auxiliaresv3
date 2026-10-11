/**
 * Generador de Actas Oficiales y Notificaciones Individuales
 * en formato Microsoft Word (.doc / OpenXML MHTML) con maquetación institucional,
 * encabezados oficiales, tablas normalizadas y pie de firmas.
 */

function enmascararDni(dni) {
  if (!dni) return '***0000**';
  const clean = dni.trim().toUpperCase();
  if (clean.length < 5) return '***' + clean;
  // Formato oficial LOPDGDD: conservar 4 dígitos centrales
  if (clean.length === 9) {
    return `***${clean.substring(3, 7)}**`;
  }
  const mid = Math.floor(clean.length / 2);
  return `***${clean.substring(mid - 2, mid + 2)}**`;
}

function formatearFechaEspanol(fechaStr) {
  const f = fechaStr ? new Date(fechaStr) : new Date();
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${f.getDate()} de ${meses[f.getMonth()]} de ${f.getFullYear()}`;
}

/**
 * Genera el documento Word del Acta Oficial del Tribunal Calificador
 */
function buildActaWordDocument(datosActa, rankingData) {
  const puesto = rankingData.puesto || {};
  const ranking = rankingData.ranking || [];
  const fechaHoy = datosActa.fecha ? formatearFechaEspanol(datosActa.fecha) : formatearFechaEspanol();
  const hora = datosActa.hora || '10:00 horas';
  const lugar = datosActa.lugar || 'Palacio Insular, Plaza de España s/n, Santa Cruz de Tenerife';
  const presidente = datosActa.presidente || 'D./Dña. Titular de la Presidencia del Tribunal';
  const secretario = datosActa.secretario || 'D./Dña. Titular de la Secretaría del Tribunal';
  const vocales = Array.isArray(datosActa.vocales) ? datosActa.vocales : [
    datosActa.vocal1 || 'D./Dña. Primer/a Vocal',
    datosActa.vocal2 || 'D./Dña. Segundo/a Vocal'
  ].filter(Boolean);

  const titular = ranking.find(r => r.estadoAdjudicacion && r.estadoAdjudicacion.includes('ADJUDICADO'));
  const reservas = ranking.filter(r => r.estadoAdjudicacion === 'RESERVA');
  const dotaciones = puesto.dotaciones || 1;

  // Filas de la tabla de clasificación
  let filasTabla = '';
  ranking.forEach((r, idx) => {
    const orden = idx + 1;
    const nombre = r.nombre || r.dni || 'Aspirante';
    const dni = datosActa.anonimizar ? enmascararDni(r.dni) : (r.dni || '-');
    const situacion = r.situacionAdministrativa === 'definitiva' ? 'Definitiva' : 'Provisional';
    const puntos = (r.puntuacionFinal || 0).toFixed(4);
    const esp = (r.desempate?.meritosEspecificos || r.desempate?.fase2 || 0).toFixed(4);
    const grado = (r.desempate?.grado || 0).toFixed(4);
    const trab = (r.desempate?.trabajo || 0).toFixed(4);
    const curs = (r.desempate?.cursos || 0).toFixed(4);
    const ant = (r.desempate?.antiguedad || 0).toFixed(4);
    
    let badgeEstado = r.estadoAdjudicacion || 'VALORADO';
    let colorFila = '#ffffff';
    if (badgeEstado.includes('ADJUDICADO')) {
      colorFila = '#f0fdf4';
    } else if (badgeEstado === 'RESERVA') {
      colorFila = '#fefce8';
    } else if (badgeEstado.includes('NO ALCANZA')) {
      colorFila = '#fef2f2';
    }

    filasTabla += `
      <tr style="background-color:${colorFila};">
        <td style="text-align:center; font-weight:bold;">${orden}º</td>
        <td><strong>${nombre}</strong></td>
        <td style="text-align:center;">${dni}</td>
        <td style="text-align:center;">${situacion}</td>
        <td style="text-align:center; font-weight:bold; color:#0f766e;">${puntos}</td>
        <td style="text-align:center;">${esp}</td>
        <td style="text-align:center;">${grado}</td>
        <td style="text-align:center;">${trab}</td>
        <td style="text-align:center;">${curs}</td>
        <td style="text-align:center;">${ant}</td>
        <td style="text-align:center; font-weight:bold;">${badgeEstado}</td>
      </tr>
    `;
  });

  const html = `
<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset="utf-8">
  <title>Acta Oficial del Tribunal Calificador</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page Section1 {
      size: 595.3pt 841.9pt;
      margin: 54.0pt 54.0pt 54.0pt 54.0pt;
      mso-header-margin: 36.0pt;
      mso-footer-margin: 36.0pt;
      mso-paper-source: 0;
    }
    div.Section1 { page: Section1; }
    body {
      font-family: 'Calibri', 'Segoe UI', Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.35;
      color: #111827;
    }
    .header-logo {
      text-align: center;
      border-bottom: 2pt solid #1e3a8a;
      padding-bottom: 8pt;
      margin-bottom: 18pt;
    }
    .header-logo h1 {
      font-size: 14pt;
      font-weight: bold;
      color: #1e3a8a;
      margin: 0;
      text-transform: uppercase;
      letter-spacing: 0.5pt;
    }
    .header-logo h2 {
      font-size: 11pt;
      font-weight: 600;
      color: #475569;
      margin: 4pt 0 0 0;
    }
    .acta-title {
      text-align: center;
      background-color: #f1f5f9;
      border: 1pt solid #cbd5e1;
      padding: 10pt;
      margin: 16pt 0;
      font-size: 12pt;
      font-weight: bold;
      color: #0f172a;
    }
    p {
      text-align: justify;
      margin: 0 0 8pt 0;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 12pt 0;
      font-size: 9.5pt;
    }
    th, td {
      border: 0.5pt solid #475569;
      padding: 5pt 6pt;
    }
    th {
      background-color: #e2e8f0;
      font-weight: bold;
      color: #1e293b;
      text-align: center;
    }
    .info-box {
      background-color: #f8fafc;
      border: 1pt solid #cbd5e1;
      border-left: 3pt solid #2563eb;
      padding: 8pt 12pt;
      margin: 10pt 0;
      font-size: 10pt;
    }
    .firmas-table {
      width: 100%;
      border: none;
      margin-top: 35pt;
    }
    .firmas-table td {
      border: none;
      width: 50%;
      text-align: center;
      vertical-align: top;
      padding-top: 40pt;
    }
  </style>
</head>
<body>
  <div class="Section1">
    <div class="header-logo">
      <h1>EXCMO. CABILDO INSULAR DE TENERIFE</h1>
      <h2>TRIBUNAL CALIFICADOR DEL CONCURSO DE PROVISIÓN DE PUESTOS DE TRABAJO</h2>
      <div style="font-size:9.5pt; color:#64748b; margin-top:3pt;">Subescala Auxiliar Administrativa • Convocatoria Oficial 2026</div>
    </div>

    <div class="acta-title">
      ACTA DE LA SESIÓN DE VALORACIÓN DEFINITIVA Y PROPUESTA DE ADJUDICACIÓN<br>
      <span style="font-size:10pt; font-weight:normal; color:#334155;">Puesto RPT [${puesto.codigoRpt || puesto.id || '-'}] - ${puesto.tipo || 'Auxiliar Administrativo/a'}</span>
    </div>

    <p>
      En <strong>Santa Cruz de Tenerife</strong>, siendo las <strong>${hora}</strong> del día <strong>${fechaHoy}</strong>, 
      se reúne en las dependencias de <em>${lugar}</em>, el Tribunal Calificador designado para juzgar la convocatoria 
      del concurso de provisión de puestos de trabajo de la Subescala Auxiliar Administrativa del Excmo. Cabildo Insular de Tenerife.
    </p>

    <div class="info-box">
      <strong>MIEMBROS ASISTENTES AL ACTO:</strong><br>
      • <strong>Presidencia:</strong> ${presidente}<br>
      • <strong>Secretaría:</strong> ${secretario}<br>
      • <strong>Vocalías:</strong> ${vocales.join(', ')}
    </div>

    <p>
      Constituido el Tribunal con el quórum legal necesario, la Presidencia declara abierta la sesión para el examen 
      del orden del día relativo a la baremación de méritos, resolución de empates conforme a la Base Novena de la convocatoria 
      y formalización de la propuesta oficial de clasificación y adjudicación del puesto convocado.
    </p>

    <h3 style="font-size:11pt; color:#1e3a8a; border-bottom: 1pt solid #cbd5e1; padding-bottom: 3pt; margin-top:14pt;">
      1. DATOS OFICIALES DE LA PLAZA CONVOCADA
    </h3>
    <table style="width:100%; margin-bottom:12pt;">
      <tr>
        <th style="width:25%; text-align:left;">Código RPT:</th>
        <td style="width:25%; font-weight:bold;">${puesto.codigoRpt || puesto.id || '-'}</td>
        <th style="width:25%; text-align:left;">Forma Provisión:</th>
        <td style="width:25%;">${puesto.formaProvision || 'Concurso ordinario'}</td>
      </tr>
      <tr>
        <th style="text-align:left;">Denominación:</th>
        <td colspan="3">${puesto.tipo || 'Auxiliar Administrativo/a'}</td>
      </tr>
      <tr>
        <th style="text-align:left;">Servicio / Área:</th>
        <td colspan="3">${puesto.servicio || '-'} ${puesto.unidad ? '(' + puesto.unidad + ')' : ''}</td>
      </tr>
      <tr>
        <th style="text-align:left;">Nivel CD / CE:</th>
        <td>Nivel CD: ${puesto.cd || 16} / CE: ${puesto.ce || '-'}</td>
        <th style="text-align:left;">Dotaciones Ofertadas:</th>
        <td style="font-weight:bold;">${dotaciones} vacante(s)</td>
      </tr>
      <tr>
        <th style="text-align:left;">Ubicación:</th>
        <td>${puesto.localizacion || 'Santa Cruz de Tenerife'}</td>
        <th style="text-align:left;">Mínimo Exigido:</th>
        <td>${(puesto.minimoSuperar || 1.5).toFixed(2)} puntos</td>
      </tr>
    </table>

    <h3 style="font-size:11pt; color:#1e3a8a; border-bottom: 1pt solid #cbd5e1; padding-bottom: 3pt; margin-top:14pt;">
      2. CUADRO OFICIAL DE CLASIFICACIÓN Y APLICACIÓN DE LA BASE NOVENA
    </h3>
    <p>
      El Tribunal, tras haber verificado documentalmente los méritos aportados y aplicado de forma estricta las cinco 
      reglas reglamentarias de desempate previstas en la <strong>Base Novena</strong> (1º Méritos Específicos ➔ 2º Grado Personal ➔ 3º Puesto de Trabajo ➔ 4º Cursos de Formación ➔ 5º Antigüedad en las AAPP), 
      aprueba la siguiente relación clasificada de concursantes en orden riguroso de prelación:
    </p>

    <table>
      <thead>
        <tr>
          <th style="width:30pt;">Nº</th>
          <th>Aspirante</th>
          <th style="width:65pt;">DNI</th>
          <th style="width:60pt;">Sit. Adm.</th>
          <th style="width:45pt;">Puntos</th>
          <th style="width:40pt;" title="1º Desempate: Específicos">1º Esp</th>
          <th style="width:40pt;" title="2º Desempate: Grado">2º Gr</th>
          <th style="width:40pt;" title="3º Desempate: Trabajo">3º Trab</th>
          <th style="width:40pt;" title="4º Desempate: Cursos">4º Cur</th>
          <th style="width:40pt;" title="5º Desempate: Antigüedad">5º Ant</th>
          <th style="width:75pt;">Propuesta</th>
        </tr>
      </thead>
      <tbody>
        ${filasTabla}
      </tbody>
    </table>

    <h3 style="font-size:11pt; color:#1e3a8a; border-bottom: 1pt solid #cbd5e1; padding-bottom: 3pt; margin-top:14pt;">
      3. ACUERDOS Y PROPUESTA DE ADJUDICACIÓN
    </h3>
    <p>
      A la vista de las puntuaciones obtenidas y del número de dotaciones convocadas (${dotaciones}), el Tribunal acuerda por unanimidad:
    </p>

    <div class="info-box" style="border-left-color: #16a34a; background-color: #f0fdf4;">
      <strong>PRIMERO.- ELEVAR PROPUESTA DE ADJUDICACIÓN</strong> a favor de la siguiente persona aspirante:<br>
      • <strong>Titular Propuesto/a:</strong> ${titular ? (titular.nombre || titular.dni) : 'Plaza Desierta (no adjudicada)'}<br>
      • <strong>DNI:</strong> ${titular ? (datosActa.anonimizar ? enmascararDni(titular.dni) : titular.dni) : '-'}<br>
      • <strong>Puntuación Total Definitiva:</strong> ${titular ? (titular.puntuacionFinal || 0).toFixed(4) + ' puntos' : '-'}<br>
      • <strong>Situación de Origen:</strong> ${titular && titular.situacionAdministrativa === 'definitiva' ? 'Titular Definitivo (Genera vacante de resulta)' : 'Adscripción Provisional / Reingreso'}
    </div>

    ${reservas.length > 0 ? `
    <div class="info-box" style="border-left-color: #ca8a04; background-color: #fefce8;">
      <strong>SEGUNDO.- CONSTITUIR LA LISTA OFICIAL DE RESERVA</strong> para el puesto indicado, ordenada conforme a la prelación reglamentaria para supuestos de renuncia o vicisitud sobrevenida:<br>
      ${reservas.map((res, i) => `• <strong>${i + 1}º Suplente de Reserva:</strong> ${res.nombre || res.dni} (${datosActa.anonimizar ? enmascararDni(res.dni) : res.dni}) — <strong>${(res.puntuacionFinal || 0).toFixed(4)} ptos</strong>`).join('<br>')}
    </div>
    ` : ''}

    <p>
      <strong>TERCERO.-</strong> Ordenar la publicación del presente acuerdo en el Tablón de Anuncios de la Corporación 
      y en la Sede Electrónica del Cabildo Insular de Tenerife, concediendo a los interesados un plazo de diez (10) días 
      hábiles a partir del siguiente a su publicación para formular alegaciones si a su derecho conviniere.
    </p>

    <p style="font-size:9.5pt; color:#4b5563; margin-top:14pt; padding:8pt; border:0.5pt solid #d1d5db; background:#f9fafb;">
      <strong>RÉGIMEN DE RECURSOS:</strong> Contra los actos de trámite cualificados y la propuesta definitiva del Tribunal Calificador, 
      las personas interesadas podrán interponer recurso de alzada ante la Presidencia del Excmo. Cabildo Insular de Tenerife en el plazo 
      de un mes a contar desde el día siguiente a su notificación o publicación, de conformidad con lo establecido en los artículos 121 y 122 
      de la Ley 39/2015, de 1 de octubre, del Procedimiento Administrativo Común de las Administraciones Públicas.
    </p>

    <p style="margin-top:16pt;">
      Y no habiendo más asuntos que tratar, la Presidencia levanta la sesión a las ${datosActa.horaFin || '12:00 horas'}, 
      de todo lo cual, como Secretario/a, doy fe.
    </p>

    <table class="firmas-table">
      <tr>
        <td>
          <strong>Vº Bº LA PRESIDENCIA</strong><br><br><br><br>
          Fdo.: ${presidente}<br>
          <span style="font-size:9pt; color:#64748b;">Excmo. Cabildo Insular de Tenerife</span>
        </td>
        <td>
          <strong>LA SECRETARÍA DEL TRIBUNAL</strong><br><br><br><br>
          Fdo.: ${secretario}<br>
          <span style="font-size:9pt; color:#64748b;">Excmo. Cabildo Insular de Tenerife</span>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>
  `;

  return Buffer.from(html, 'utf8');
}

/**
 * Genera el documento Word de la Notificación Individual Oficial del Aspirante
 */
function buildNotificacionIndividualWordDocument(candidateData, calculationResult) {
  const fHoy = formatearFechaEspanol();
  const nombre = candidateData.nombre || 'Aspirante Concursante';
  const dni = candidateData.dni || '-';
  const puesto = candidateData.puestoSolicitado || {};
  const merits = candidateData.merits || {};
  const cursos = Array.isArray(merits.cursos) ? merits.cursos : [];
  const experiencia = Array.isArray(merits.experiencia) ? merits.experiencia : [];

  let filasCursos = '';
  cursos.forEach((c) => {
    filasCursos += `
      <tr>
        <td>${c.titulo || 'Curso sin denominación'}</td>
        <td style="text-align:center;">${c.horas || 0} h</td>
        <td style="text-align:center;">${c.tipo || 'Aprovechamiento'}</td>
        <td style="text-align:center;">${c.esEspecifico ? 'Específico' : 'General / Transversal'}</td>
        <td style="text-align:center; font-weight:bold; color:${c.incluido !== false ? '#15803d' : '#b91c1c'};">
          ${c.incluido !== false ? 'COMPUTADO' : 'EXCLUIDO'}
        </td>
      </tr>
    `;
  });
  if (cursos.length === 0) {
    filasCursos = `<tr><td colspan="5" style="text-align:center; color:#64748b;">No se han presentado certificados de formación.</td></tr>`;
  }

  let filasExp = '';
  experiencia.forEach((e) => {
    filasExp += `
      <tr>
        <td>${e.puesto || 'Auxiliar Administrativo/a'}</td>
        <td>${e.administracion || 'Cabildo de Tenerife'}</td>
        <td style="text-align:center;">CD ${e.cd || 16}</td>
        <td style="text-align:center;">${e.dias || 0} días</td>
        <td style="text-align:center;">${e.esEspecificaAmbito ? 'Sí (Ámbito Específico)' : 'No (General)'}</td>
      </tr>
    `;
  });
  if (experiencia.length === 0) {
    filasExp = `<tr><td colspan="5" style="text-align:center; color:#64748b;">No se han presentado períodos de servicios previos.</td></tr>`;
  }

  const html = `
<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset="utf-8">
  <title>Notificación Individual de Baremación</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page Section1 {
      size: 595.3pt 841.9pt;
      margin: 54.0pt 54.0pt 54.0pt 54.0pt;
    }
    div.Section1 { page: Section1; }
    body {
      font-family: 'Calibri', Arial, sans-serif;
      font-size: 10.5pt;
      line-height: 1.35;
      color: #111827;
    }
    .header-logo {
      text-align: center;
      border-bottom: 2pt solid #0f766e;
      padding-bottom: 8pt;
      margin-bottom: 16pt;
    }
    .header-logo h1 {
      font-size: 13pt;
      color: #0f766e;
      margin: 0;
      text-transform: uppercase;
    }
    .header-logo h2 {
      font-size: 10.5pt;
      color: #475569;
      margin: 3pt 0 0 0;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 8pt 0 12pt 0;
      font-size: 9.5pt;
    }
    th, td {
      border: 0.5pt solid #64748b;
      padding: 5pt 7pt;
    }
    th {
      background-color: #f1f5f9;
      font-weight: bold;
      color: #1e293b;
    }
    .box {
      background-color: #f8fafc;
      border: 1pt solid #cbd5e1;
      padding: 8pt 10pt;
      margin: 8pt 0;
    }
  </style>
</head>
<body>
  <div class="Section1">
    <div class="header-logo">
      <h1>EXCMO. CABILDO INSULAR DE TENERIFE - IASS</h1>
      <h2>COMISIÓN PERMANENTE DE VALORACIÓN • TRIBUNAL CALIFICADOR</h2>
      <div style="font-size:9pt; color:#64748b;">Concurso de Provisión de Puestos • Subescala Auxiliar Administrativa</div>
    </div>

    <div style="text-align:center; font-weight:bold; font-size:12pt; background:#f0fdfa; border:1pt solid #99f6e4; padding:8pt; margin-bottom:12pt; color:#115e59;">
      FICHA OFICIAL DE NOTIFICACIÓN INDIVIDUAL DE BAREMACIÓN DE MÉRITOS
    </div>

    <table style="width:100%;">
      <tr>
        <th style="width:25%;">Aspirante:</th>
        <td style="width:75%; font-weight:bold; font-size:10.5pt;">${nombre}</td>
      </tr>
      <tr>
        <th>DNI / NIF:</th>
        <td>${dni}</td>
      </tr>
      <tr>
        <th>Puesto Solicitado:</th>
        <td><strong>[${puesto.codigoRpt || puesto.id || '-'}]</strong> ${puesto.tipo || 'Auxiliar Administrativo/a'} - ${puesto.servicio || ''}</td>
      </tr>
      <tr>
        <th>Forma de Provisión:</th>
        <td>${puesto.formaProvision || 'Concurso ordinario'} (Nivel CD ${puesto.cd || 16})</td>
      </tr>
      <tr>
        <th>Fecha de Expedición:</th>
        <td>${fHoy}</td>
      </tr>
    </table>

    <h4 style="color:#0f766e; margin:10pt 0 4pt 0; border-bottom:1pt solid #cbd5e1; padding-bottom:2pt;">
      1. RESUMEN DE PUNTUACIONES POR BLOQUE DE MÉRITO
    </h4>
    <table>
      <thead>
        <tr>
          <th>Bloque / Criterio de Valoración</th>
          <th style="width:75pt; text-align:center;">Puntuación</th>
          <th style="width:70pt; text-align:center;">Tope Máx.</th>
          <th>Detalle de Cómputo</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>a) Méritos específicos</strong> (cursos específicos, títulos, idiomas)</td>
          <td style="text-align:center; font-weight:bold;">${(calculationResult.apartados?.meritosEspecificos?.puntos || 0).toFixed(4)}</td>
          <td style="text-align:center;">${calculationResult.apartados?.meritosEspecificos?.tope || 4.00}</td>
          <td>Cursos: ${(calculationResult.apartados?.meritosEspecificos?.desglose?.cursosEspecificos || 0).toFixed(2)} | Idiomas/Títulos: ${(calculationResult.apartados?.meritosEspecificos?.desglose?.titulaciones || 0) + (calculationResult.apartados?.meritosEspecificos?.desglose?.idiomas || 0)}</td>
        </tr>
        <tr>
          <td><strong>b) Grado personal consolidado</strong></td>
          <td style="text-align:center; font-weight:bold;">${(calculationResult.apartados?.gradoPersonal?.puntos || 0).toFixed(4)}</td>
          <td style="text-align:center;">${calculationResult.apartados?.gradoPersonal?.tope || 3.00}</td>
          <td>Nivel reconocido: ${candidateData.gradoPersonal || '14'}</td>
        </tr>
        <tr>
          <td><strong>c) Trabajo desarrollado</strong> (experiencia profesional)</td>
          <td style="text-align:center; font-weight:bold;">${(calculationResult.apartados?.trabajoDesarrollado?.puntos || 0).toFixed(4)}</td>
          <td style="text-align:center;">${calculationResult.apartados?.trabajoDesarrollado?.tope || 6.00}</td>
          <td>Bruto computado: ${(calculationResult.apartados?.trabajoDesarrollado?.puntosBrutos || 0).toFixed(4)} ptos</td>
        </tr>
        <tr>
          <td><strong>d) Cursos de formación y perfeccionamiento</strong></td>
          <td style="text-align:center; font-weight:bold;">${(calculationResult.apartados?.cursosFormacion?.puntos || 0).toFixed(4)}</td>
          <td style="text-align:center;">${calculationResult.apartados?.cursosFormacion?.tope || 4.00}</td>
          <td>Bruto computado: ${(calculationResult.apartados?.cursosFormacion?.puntosBrutos || 0).toFixed(4)} ptos</td>
        </tr>
        <tr>
          <td><strong>e) Antigüedad en Administraciones Públicas</strong></td>
          <td style="text-align:center; font-weight:bold;">${(calculationResult.apartados?.antiguedad?.puntos || 0).toFixed(4)}</td>
          <td style="text-align:center;">${calculationResult.apartados?.antiguedad?.tope || 3.00}</td>
          <td>Vinculada: ${(calculationResult.apartados?.antiguedad?.desglose?.vinculada || 0).toFixed(4)} | Otras: ${(calculationResult.apartados?.antiguedad?.desglose?.otras || 0).toFixed(4)}</td>
        </tr>
        <tr>
          <td><strong>f) Conciliación de la vida personal y familiar</strong></td>
          <td style="text-align:center; font-weight:bold;">${(calculationResult.apartados?.conciliacion?.puntos || 0).toFixed(4)}</td>
          <td style="text-align:center;">${calculationResult.apartados?.conciliacion?.tope || 1.00}</td>
          <td>Hijos: ${candidateData.conciliacionHijos ? '0.5' : '0.0'} | Cónyuge: ${candidateData.conciliacionConyuge ? '0.5' : '0.0'}</td>
        </tr>
        <tr style="background-color:#f0fdf4; font-weight:bold; font-size:10.5pt;">
          <td style="text-align:right;">PUNTUACIÓN TOTAL DEFINITIVA:</td>
          <td style="text-align:center; color:#15803d; font-size:11.5pt;">${(calculationResult.puntuacionFinal || 0).toFixed(4)}</td>
          <td style="text-align:center;">10.00</td>
          <td style="color:${calculationResult.superaMinimo ? '#15803d' : '#b91c1c'};">
            ${calculationResult.superaMinimo ? 'APTO / SUPERA MÍNIMO DE CONVOCATORIA' : 'NO ALCANZA MÍNIMO EXIGIDO'}
          </td>
        </tr>
      </tbody>
    </table>

    <h4 style="color:#0f766e; margin:10pt 0 4pt 0; border-bottom:1pt solid #cbd5e1; padding-bottom:2pt;">
      2. DETALLE DE CURSOS DE FORMACIÓN VALORADOS
    </h4>
    <table>
      <thead>
        <tr>
          <th>Denominación del Curso</th>
          <th style="width:45pt; text-align:center;">Horas</th>
          <th style="width:85pt; text-align:center;">Modalidad</th>
          <th style="width:90pt; text-align:center;">Carácter</th>
          <th style="width:70pt; text-align:center;">Dictamen</th>
        </tr>
      </thead>
      <tbody>
        ${filasCursos}
      </tbody>
    </table>

    <h4 style="color:#0f766e; margin:10pt 0 4pt 0; border-bottom:1pt solid #cbd5e1; padding-bottom:2pt;">
      3. DETALLE DE PERÍODOS DE SERVICIOS PRESTADOS
    </h4>
    <table>
      <thead>
        <tr>
          <th>Puesto y Funciones</th>
          <th>Administración Pública</th>
          <th style="width:50pt; text-align:center;">Nivel CD</th>
          <th style="width:60pt; text-align:center;">Días</th>
          <th style="width:95pt; text-align:center;">Ámbito Específico</th>
        </tr>
      </thead>
      <tbody>
        ${filasExp}
      </tbody>
    </table>

    <div style="font-size:9pt; color:#475569; border-top:1pt solid #cbd5e1; padding-top:6pt; margin-top:14pt; text-align:justify;">
      <strong>PLAZO DE ALEGACIONES:</strong> De conformidad con las bases de la convocatoria, contra la presente baremación provisional 
      podrá formular reclamación ante la Comisión Permanente de Valoración en el plazo de diez (10) días hábiles contados a partir del siguiente 
      a la publicación del listado provisional en la Sede Electrónica del Cabildo de Tenerife.
    </div>

    <div style="text-align:right; margin-top:25pt;">
      <strong>La Secretaría del Tribunal Calificador</strong><br>
      <em>Excmo. Cabildo Insular de Tenerife</em>
    </div>
  </div>
</body>
</html>
  `;

  return Buffer.from(html, 'utf8');
}

module.exports = {
  enmascararDni,
  formatearFechaEspanol,
  buildActaWordDocument,
  buildNotificacionIndividualWordDocument
};
