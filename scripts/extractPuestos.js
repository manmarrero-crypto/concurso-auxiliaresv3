const { PDFParse } = require('pdf-parse');
const fs = require('fs');
const path = require('path');

async function extractPuestos() {
  const pdfPath = 'C:/Users/Educacion/.gemini/antigravity/brain/43b5fe1f-6f73-4cd6-9196-8632dd0a0ed1/.user_uploaded/media_1791618770058_cd2c8706.pdf';
  const buf = fs.readFileSync(pdfPath);
  
  const parser = new PDFParse(new Uint8Array(buf));
  await parser.load();
  const res = await parser.getText();
  const pages = res.pages;
  
  let currentConsejeria = 'Cabildo Insular de Tenerife';
  let currentServicio = 'Servicios Centrales';
  let currentLocalizacion = 'Zona metropolitana Santa Cruz de Tenerife - La Laguna';
  
  const rawPuestos = [];
  const seenRpt = new Set();
  
  for (let pIdx = 50; pIdx < pages.length; pIdx++) {
    const pageText = pages[pIdx].text;
    const lines = pageText.split('\n');
    let currentPuesto = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      if (line.startsWith('Boletín Oficial') || line.match(/^-- \d+ of \d+ --$/) || line.match(/^\d+$/)) {
        continue;
      }
      
      if (line.startsWith('CONSEJERÍA') || line.startsWith('ORGANISMO AUTÓNOMO') || line.startsWith('ÁREA DE ')) {
        currentConsejeria = line.replace(/[\n\r\t]+/g, ' ').replace(/\.$/, '').trim();
      } else if (line.startsWith('Servicio ') || line.startsWith('Servicio Técnico') || line.startsWith('Servicio Administrativo') || line.startsWith('Unidad de Control Interno') || line.startsWith('Unidad Orgánica de Tesorería') || line.startsWith('Apoyo a las Áreas')) {
        currentServicio = line.replace(/[\n\r\t]+/g, ' ').replace(/\.$/, '').trim();
      } else if (line.startsWith('Tipo de Puesto')) {
        if (currentPuesto && currentPuesto.codigoRpt && !seenRpt.has(currentPuesto.codigoRpt)) {
          seenRpt.add(currentPuesto.codigoRpt);
          rawPuestos.push(currentPuesto);
        }
        const tipoVal = line.replace('Tipo de Puesto', '').replace(/[\t]+/g, ' ').trim();
        currentPuesto = {
          codigoRpt: '',
          tipo: tipoVal,
          consejeria: currentConsejeria,
          servicio: currentServicio,
          unidad: '',
          localizacion: currentLocalizacion,
          formaProvision: 'Concurso ordinario'
        };
      } else if (currentPuesto && line.startsWith('Código RPT')) {
        currentPuesto.codigoRpt = line.replace('Código RPT', '').replace(/[\t]+/g, ' ').trim();
      } else if (currentPuesto && line.startsWith('Unidad Orgánica')) {
        currentPuesto.unidad = line.replace('Unidad Orgánica', '').replace(/[\n\r\t]+/g, ' ').trim();
      } else if (line.startsWith('Localización Geográfica')) {
        const loc = line.replace('Localización Geográfica', '').replace(/[\n\r\t]+/g, ' ').trim();
        if (loc) {
          currentLocalizacion = loc;
          if (currentPuesto) currentPuesto.localizacion = loc;
        }
      } else if (currentPuesto && line.startsWith('Forma de Provisión')) {
        currentPuesto.formaProvision = line.replace('Forma de Provisión', '').replace(/[\t]+/g, ' ').trim();
      }
    }
    if (currentPuesto && currentPuesto.codigoRpt && !seenRpt.has(currentPuesto.codigoRpt)) {
      seenRpt.add(currentPuesto.codigoRpt);
      rawPuestos.push(currentPuesto);
    }
  }

  // Si algún puesto quedó sin código RPT o para completar hasta las 139 dotaciones
  console.log('Parsed unique RPTs:', rawPuestos.length);

  const catalogo = rawPuestos.map(p => {
    const isEsp = p.tipo.includes('Jefe') || p.tipo.includes('Gestor') || p.tipo.includes('Extensión');
    const isAdscrito = p.tipo.includes('Adscrito');
    const cd = isEsp ? 18 : (isAdscrito ? 14 : 16);
    const ce = isEsp ? (p.tipo.includes('Extensión') ? 30 : 32) : (isAdscrito ? 25 : 28);
    const formaProvision = isEsp ? 'Concurso específico' : 'Concurso ordinario';
    const minimoSuperar = isEsp ? 4.0 : (isAdscrito ? 1.0 : 1.5);
    const esPuestoUnico = p.tipo.includes('Contenidos Digitales') || p.tipo.includes('Apoyo Jurídico Procesal');

    let reqExp = '18 meses en la Subescala Administrativa de Administración General';
    if (isEsp) {
      reqExp = '12 meses en Cabildo en nivel 16/18, o 30 meses en AAPP (mínimo 12 en Cabildo)';
    } else if (isAdscrito) {
      reqExp = '9 meses en Subescala Auxiliar de Admón General o laboral';
    }

    const entidadCorta = p.consejeria.includes('IASS') || p.servicio.includes('IASS') ? 'IASS' : 'Cabildo de Tenerife';
    const desc = `${p.servicio}${p.unidad ? ' (' + p.unidad + ')' : ''} [${p.localizacion}]`;

    return {
      id: p.codigoRpt,
      codigoRpt: p.codigoRpt,
      tipo: p.tipo,
      formaProvision,
      cd,
      ce,
      dotaciones: 1,
      consejeria: p.consejeria,
      entidad: entidadCorta,
      servicio: p.servicio,
      unidad: p.unidad,
      localizacion: p.localizacion,
      requisitoExperiencia: reqExp,
      minimoSuperar,
      ...(isEsp ? { minimoFase1: 2.5, minimoFase2: 1.5 } : {}),
      esPuestoUnico,
      descripcion: desc,
      denominacionLarga: `[${p.codigoRpt}] ${p.tipo} - ${p.servicio}${p.unidad ? ' (' + p.unidad + ')' : ''} - ${p.localizacion}`
    };
  });

  const targetPath = path.join(__dirname, '..', 'data', 'puestos.json');
  fs.writeFileSync(targetPath, JSON.stringify(catalogo, null, 2), 'utf-8');
  console.log(`Saved ${catalogo.length} puestos into ${targetPath}`);
}

extractPuestos().catch(console.error);
