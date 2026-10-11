/**
 * Lógica del cliente (Frontend) para la aplicación de baremación y adjudicación
 */

let catalogoPuestos = [];
let puestoSeleccionado = null;
let meritoActual = {
  cursos: [],
  experiencia: [],
  titulaciones: [],
  idiomas: [],
  archivosProcesados: []
};
let ultimoCalculo = null;
let puestoRankingActual = null;
let datosRankingActual = null;

// Inicialización al cargar la página
document.addEventListener('DOMContentLoaded', async () => {
  await cargarPuestos();
  await actualizarContadorAspirantes();
  configurarEventos();
  recalcular();
});

let puestosSolicitados = [];
let verSoloSeleccionados = false;

// Comprobar si dos puestos representan la misma plaza convocada
function esMismoPuesto(p1, p2) {
  if (!p1 || !p2) return false;
  const id1 = typeof p1 === 'string' ? p1 : (p1.id || p1.codigoRpt);
  const id2 = typeof p2 === 'string' ? p2 : (p2.id || p2.codigoRpt);
  if (id1 && id2 && id1 === id2) return true;

  const rpt1 = typeof p1 === 'object' ? (p1.codigoRpt || p1.id) : p1;
  const rpt2 = typeof p2 === 'object' ? (p2.codigoRpt || p2.id) : p2;
  if (rpt1 && rpt2 && rpt1 === rpt2) return true;

  const esUnico1 = typeof p1 === 'object' ? p1.esPuestoUnico : false;
  const esUnico2 = typeof p2 === 'object' ? p2.esPuestoUnico : false;
  const tipo1 = typeof p1 === 'object' ? p1.tipo : p1;
  const tipo2 = typeof p2 === 'object' ? p2.tipo : p2;
  if ((esUnico1 || esUnico2) && tipo1 && tipo2 && tipo1 === tipo2) return true;

  return false;
}

// Cargar catálogo de puestos desde el backend
async function cargarPuestos() {
  try {
    const res = await fetch('/api/puestos');
    catalogoPuestos = await res.json();
    
    poblarSelectoresPuestos();

    if (catalogoPuestos.length > 0) {
      if (puestosSolicitados.length === 0) {
        puestosSolicitados = [{ ...catalogoPuestos[0], orden: 1 }];
        seleccionarPuesto(0);
        puestoRankingActual = catalogoPuestos[0].id || catalogoPuestos[0].codigoRpt;
      }
      renderizarListaOrdenablePuestos();
      renderizarChecklistPuestos();
      renderizarPillsPuestos();
    }
  } catch (err) {
    console.error('Error cargando puestos:', err);
  }
}

// Poblar desplegables de puestos (ficha individual y ranking)
function poblarSelectoresPuestos(filtroRankingText = '') {
  const select = document.getElementById('selectPuesto');
  if (select) {
    const valorPrevio = select.value;
    select.innerHTML = '';
    catalogoPuestos.forEach((p, index) => {
      const opt = document.createElement('option');
      opt.value = index;
      opt.textContent = `[${p.codigoRpt || p.id}] ${p.tipo} - ${p.servicio || 'Servicio'} [${p.localizacion || 'S/C'}]`;
      select.appendChild(opt);
    });
    if (valorPrevio !== '') select.value = valorPrevio;
  }

  const selectRanking = document.getElementById('selectPuestoRanking');
  if (selectRanking) {
    const valorPrevioRank = puestoRankingActual || selectRanking.value;
    selectRanking.innerHTML = '';
    const q = filtroRankingText.toLowerCase().trim();

    catalogoPuestos.forEach((p) => {
      const label = `[${p.codigoRpt || p.id}] ${p.tipo} - ${p.servicio || ''} [${p.localizacion || 'S/C'}]`;
      if (q && !label.toLowerCase().includes(q)) {
        return;
      }
      const optR = document.createElement('option');
      optR.value = p.id || p.codigoRpt;
      optR.textContent = label;
      selectRanking.appendChild(optR);
    });

    if (valorPrevioRank && selectRanking.querySelector(`option[value="${valorPrevioRank}"]`)) {
      selectRanking.value = valorPrevioRank;
    }
  }
}

function renderizarChecklistPuestos() {
  const container = document.getElementById('contenedorPuestosChecklist');
  if (!container) return;
  container.innerHTML = '';

  const filtroTexto = (document.getElementById('filtroTextoPuestos')?.value || '').toLowerCase().trim();
  const filtroTipo = document.getElementById('filtroTipoPuestosSelect')?.value || '';
  const filtroEntidad = document.getElementById('filtroEntidadPuestosSelect')?.value || '';

  // Filtrado de puestos
  const puestosFiltrados = catalogoPuestos.map((p, idx) => ({ p, idx })).filter(({ p }) => {
    // Filtro "Solo Marcados"
    if (verSoloSeleccionados) {
      const esta = puestosSolicitados.some(ps => esMismoPuesto(ps, p));
      if (!esta) return false;
    }

    // Filtro por Tipo / Puestos únicos
    if (filtroTipo === 'unicos') {
      if (!p.esPuestoUnico) return false;
    } else if (filtroTipo) {
      if (p.tipo !== filtroTipo) return false;
    }

    // Filtro por Entidad
    if (filtroEntidad) {
      if (!((p.entidad || '').toLowerCase().includes(filtroEntidad.toLowerCase()))) return false;
    }

    // Filtro de texto libre (código, servicio, tipo, unidad, localización)
    if (filtroTexto) {
      const match = (p.codigoRpt && p.codigoRpt.toLowerCase().includes(filtroTexto)) ||
                    (p.tipo && p.tipo.toLowerCase().includes(filtroTexto)) ||
                    (p.servicio && p.servicio.toLowerCase().includes(filtroTexto)) ||
                    (p.unidad && p.unidad.toLowerCase().includes(filtroTexto)) ||
                    (p.localizacion && p.localizacion.toLowerCase().includes(filtroTexto)) ||
                    (p.consejeria && p.consejeria.toLowerCase().includes(filtroTexto));
      if (!match) return false;
    }

    return true;
  });

  if (puestosFiltrados.length === 0) {
    container.innerHTML = `
      <div style="padding:1.5rem; text-align:center; color:#64748b; font-size:0.85rem;">
        🔍 No se encontraron puestos con los filtros indicados.
        <br><button type="button" class="btn btn-sm btn-outline mt-2" onclick="limpiarFiltrosPuestos()">Limpiar Filtros</button>
      </div>`;
    return;
  }

  puestosFiltrados.forEach(({ p, idx }) => {
    const prefItem = puestosSolicitados.find(ps => esMismoPuesto(ps, p));
    const estaSeleccionado = !!prefItem;
    const orden = estaSeleccionado ? (prefItem.orden || 1) : null;
    const esElActivo = puestoSeleccionado && esMismoPuesto(puestoSeleccionado, p);

    const div = document.createElement('div');
    div.className = `puesto-check-item ${esElActivo ? 'active' : ''}`;
    div.innerHTML = `
      <div class="puesto-check-left" style="display:flex; align-items:flex-start; gap:8px; flex:1;">
        <input type="checkbox" id="chkPuesto_${idx}" ${estaSeleccionado ? 'checked' : ''} style="cursor:pointer; width:18px; height:18px; margin-top:2px;">
        <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
          <span class="puesto-pref-badge ${estaSeleccionado ? 'selected' : ''}" id="badgePref_${idx}" style="white-space:nowrap;">
            ${estaSeleccionado ? `${orden}ª Opción` : 'No marcado'}
          </span>
          ${estaSeleccionado ? `
            <div style="display:flex; gap:2px; margin-top:2px;">
              <button type="button" class="btn btn-sm btn-outline" onclick="subirPreferenciaPuesto('${p.id || p.codigoRpt}')" style="padding:0px 5px; font-size:0.65rem; line-height:1.1;" title="Subir preferencia (mayor prioridad)">▲</button>
              <button type="button" class="btn btn-sm btn-outline" onclick="bajarPreferenciaPuesto('${p.id || p.codigoRpt}')" style="padding:0px 5px; font-size:0.65rem; line-height:1.1;" title="Bajar preferencia (menor prioridad)">▼</button>
            </div>
          ` : ''}
        </div>
        <div style="flex:1; min-width:0;">
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <span class="badge badge-primary" style="font-size:0.75rem; font-weight:700;">${p.codigoRpt || p.id}</span>
            <strong style="font-size:0.875rem; color:#1e293b;">${p.tipo}</strong>
            ${p.esPuestoUnico ? '<span class="badge badge-warning" style="font-size:0.68rem;">⭐ Único</span>' : ''}
          </div>
          <div style="font-size:0.785rem; color:#334155; margin-top:2px;">
            🏢 <strong>${p.servicio || 'Servicio General'}</strong> ${p.unidad ? '· <span style="color:#64748b;">' + p.unidad + '</span>' : ''}
          </div>
          <div style="font-size:0.72rem; color:#64748b; margin-top:1px;">
            📍 ${p.localizacion || 'Santa Cruz de Tenerife'} • ${p.formaProvision} • CD ${p.cd} (CE ${p.ce || '-'}) • ${p.entidad || 'Cabildo'}
          </div>
        </div>
      </div>
      <div style="margin-left:8px; display:flex; align-items:center;">
        <button type="button" class="btn btn-sm ${esElActivo ? 'btn-primary' : 'btn-outline'}" 
          onclick="seleccionarPuestoParaVer(${idx})" 
          style="padding: 3px 8px; font-size: 0.725rem; white-space:nowrap;" title="Ver baremo para este puesto">
          ${esElActivo ? '👁️ Viendo' : 'Ver Baremo'}
        </button>
      </div>
    `;

    const chk = div.querySelector(`#chkPuesto_${idx}`);
    chk.addEventListener('change', (e) => {
      togglePuestoSolicitado(idx, e.target.checked);
    });

    container.appendChild(div);
  });

  const badgeCount = document.getElementById('badgeNumPuestosMarcados');
  if (badgeCount) {
    badgeCount.textContent = `${puestosSolicitados.length} seleccionado(s)`;
  }
  const badgeTab = document.getElementById('badgeNumPuestosMarcadosTab');
  if (badgeTab) {
    badgeTab.textContent = puestosSolicitados.length;
  }
}

// Renderizar la lista ordenada exclusiva de puestos solicitados por el candidato
function renderizarListaOrdenablePuestos() {
  const container = document.getElementById('contenedorListaOrdenablePuestos');
  if (!container) return;
  container.innerHTML = '';

  const total = puestosSolicitados.length;
  const badgeTab = document.getElementById('badgeNumPuestosMarcadosTab');
  if (badgeTab) badgeTab.textContent = total;
  const badgeCount = document.getElementById('badgeNumPuestosMarcados');
  if (badgeCount) badgeCount.textContent = `${total} seleccionado(s)`;

  if (total === 0) {
    container.innerHTML = `
      <div style="padding:1.5rem; text-align:center; color:#64748b; font-size:0.85rem; background:#ffffff; border-radius:6px; border:1px dashed #cbd5e1;">
        📭 No hay ningún puesto seleccionado para este candidato.
        <br><button type="button" class="btn btn-sm btn-primary mt-2" onclick="cambiarVistaPuestos('catalogo')">🔍 Explorar Catálogo y Seleccionar Plazas</button>
      </div>`;
    return;
  }

  puestosSolicitados.forEach((ps, idx) => {
    const esElActivo = puestoSeleccionado && esMismoPuesto(puestoSeleccionado, ps);
    const div = document.createElement('div');
    div.className = `puesto-orden-card ${esElActivo ? 'active' : ''}`;
    
    // Generar opciones para el selector numérico directo (1ª, 2ª, 3ª...)
    let optionsOrden = '';
    for (let o = 1; o <= total; o++) {
      optionsOrden += `<option value="${o}" ${o === (ps.orden || (idx + 1)) ? 'selected' : ''}>${o}ª Opción</option>`;
    }

    div.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
          <select class="form-control select-orden-pref" onchange="cambiarOrdenDirecto('${ps.id || ps.codigoRpt}', this.value)" style="padding:2px 4px; font-size:0.75rem; font-weight:700; width:95px; height:28px; background:#eff6ff; border-color:#93c5fd; color:#1e40af;">
            ${optionsOrden}
          </select>
          <div style="display:flex; gap:3px; margin-top:2px;">
            <button type="button" class="btn btn-sm btn-outline btn-arrow-reorder" onclick="subirPreferenciaPuesto('${ps.id || ps.codigoRpt}')" ${idx === 0 ? 'disabled' : ''} title="Subir preferencia (mayor prioridad)">▲</button>
            <button type="button" class="btn btn-sm btn-outline btn-arrow-reorder" onclick="bajarPreferenciaPuesto('${ps.id || ps.codigoRpt}')" ${idx === total - 1 ? 'disabled' : ''} title="Bajar preferencia (menor prioridad)">▼</button>
          </div>
        </div>

        <div style="flex:1; min-width:0; padding-left:4px;">
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <span class="badge badge-primary" style="font-size:0.75rem; font-weight:700;">${ps.codigoRpt || ps.id}</span>
            <strong style="font-size:0.875rem; color:#1e293b;">${ps.tipo}</strong>
            ${ps.esPuestoUnico ? '<span class="badge badge-warning" style="font-size:0.68rem;">⭐ Único</span>' : ''}
          </div>
          <div style="font-size:0.775rem; color:#334155; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${ps.servicio || 'Servicio General'}">
            🏢 <strong>${ps.servicio || 'Servicio General'}</strong>
          </div>
          <div style="font-size:0.72rem; color:#64748b; margin-top:1px;">
            📍 ${ps.localizacion || 'S/C Tenerife'} • CD ${ps.cd} (CE ${ps.ce || '-'}) • ${ps.formaProvision}
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:6px;">
          <button type="button" class="btn btn-sm ${esElActivo ? 'btn-primary' : 'btn-outline'}" 
            onclick="seleccionarPuestoPorId('${ps.id || ps.codigoRpt}')" 
            style="padding:3px 8px; font-size:0.725rem; white-space:nowrap;" title="Ver baremo para este puesto">
            ${esElActivo ? '👁️ Viendo' : 'Ver Baremo'}
          </button>
          <button type="button" class="btn-icon-danger" onclick="quitarPuestoSolicitado('${ps.id || ps.codigoRpt}')" style="font-size:1.15rem; padding:0 4px;" title="Quitar de mis puestos solicitados">&times;</button>
        </div>
      </div>
    `;

    container.appendChild(div);
  });
}

// Conmutar entre la vista de Puestos Solicitados y el Buscador del Catálogo
function cambiarVistaPuestos(modo) {
  const panelSol = document.getElementById('panelPuestosSolicitadosOrdenables');
  const panelCat = document.getElementById('panelCatalogoCompletoChecklist');
  const tabSol = document.getElementById('tabBtnVerSoloSolicitados');
  const tabCat = document.getElementById('tabBtnVerCatalogoCompleto');

  if (modo === 'solicitados') {
    if (panelSol) panelSol.style.display = 'block';
    if (panelCat) panelCat.style.display = 'none';
    if (tabSol) { tabSol.className = 'btn btn-sm btn-primary'; }
    if (tabCat) { tabCat.className = 'btn btn-sm btn-outline'; }
    renderizarListaOrdenablePuestos();
  } else {
    if (panelSol) panelSol.style.display = 'none';
    if (panelCat) panelCat.style.display = 'block';
    if (tabSol) { tabSol.className = 'btn btn-sm btn-outline'; }
    if (tabCat) { tabCat.className = 'btn btn-sm btn-primary'; }
    renderizarChecklistPuestos();
  }
}

// Cambiar directamente el orden de un puesto a una posición específica
function cambiarOrdenDirecto(pId, nuevoOrdenStr) {
  const nuevoOrden = parseInt(nuevoOrdenStr, 10);
  const actualIdx = puestosSolicitados.findIndex(ps => esMismoPuesto(ps, pId));
  if (actualIdx === -1 || isNaN(nuevoOrden) || nuevoOrden < 1 || nuevoOrden > puestosSolicitados.length) return;

  const targetIdx = nuevoOrden - 1;
  if (actualIdx === targetIdx) return;

  const [item] = puestosSolicitados.splice(actualIdx, 1);
  puestosSolicitados.splice(targetIdx, 0, item);

  puestosSolicitados.forEach((ps, i) => ps.orden = i + 1);

  renderizarListaOrdenablePuestos();
  renderizarChecklistPuestos();
  renderizarPillsPuestos();
  recalcular();
}

// Subir orden de preferencia de un puesto solicitado
function subirPreferenciaPuesto(pId) {
  const idx = puestosSolicitados.findIndex(ps => esMismoPuesto(ps, pId));
  if (idx > 0) {
    const temp = puestosSolicitados[idx];
    puestosSolicitados[idx] = puestosSolicitados[idx - 1];
    puestosSolicitados[idx - 1] = temp;
    puestosSolicitados.forEach((ps, i) => ps.orden = i + 1);
    renderizarListaOrdenablePuestos();
    renderizarChecklistPuestos();
    renderizarPillsPuestos();
    recalcular();
  }
}

// Bajar orden de preferencia de un puesto solicitado
function bajarPreferenciaPuesto(pId) {
  const idx = puestosSolicitados.findIndex(ps => esMismoPuesto(ps, pId));
  if (idx >= 0 && idx < puestosSolicitados.length - 1) {
    const temp = puestosSolicitados[idx];
    puestosSolicitados[idx] = puestosSolicitados[idx + 1];
    puestosSolicitados[idx + 1] = temp;
    puestosSolicitados.forEach((ps, i) => ps.orden = i + 1);
    renderizarListaOrdenablePuestos();
    renderizarChecklistPuestos();
    renderizarPillsPuestos();
    recalcular();
  }
}

// Quitar un puesto de la lista de solicitados
function quitarPuestoSolicitado(pId) {
  puestosSolicitados = puestosSolicitados.filter(ps => !esMismoPuesto(ps, pId));
  puestosSolicitados.forEach((ps, i) => ps.orden = i + 1);

  if (puestoSeleccionado && esMismoPuesto(puestoSeleccionado, pId)) {
    if (puestosSolicitados.length > 0) {
      const primerIdx = catalogoPuestos.findIndex(cp => esMismoPuesto(cp, puestosSolicitados[0]));
      if (primerIdx >= 0) {
        document.getElementById('selectPuesto').value = primerIdx;
        seleccionarPuesto(primerIdx);
      }
    }
  }

  renderizarListaOrdenablePuestos();
  renderizarChecklistPuestos();
  renderizarPillsPuestos();
  recalcular();
}

function limpiarFiltrosPuestos() {
  const fTxt = document.getElementById('filtroTextoPuestos');
  if (fTxt) fTxt.value = '';
  const fTipo = document.getElementById('filtroTipoPuestosSelect');
  if (fTipo) fTipo.value = '';
  const fEnt = document.getElementById('filtroEntidadPuestosSelect');
  if (fEnt) fEnt.value = '';
  verSoloSeleccionados = false;
  renderizarChecklistPuestos();
}

function togglePuestoSolicitado(idx, checked) {
  const p = catalogoPuestos[idx];
  if (!p) return;

  if (checked) {
    if (!puestosSolicitados.some(ps => esMismoPuesto(ps, p))) {
      puestosSolicitados.push({
        ...p,
        orden: puestosSolicitados.length + 1
      });
    }
  } else {
    puestosSolicitados = puestosSolicitados.filter(ps => !esMismoPuesto(ps, p));
    puestosSolicitados.forEach((ps, i) => {
      ps.orden = i + 1;
    });
  }

  // Si desmarcó el que estaba activo y quedan otros, previsualizar el primero
  if (!checked && puestoSeleccionado && esMismoPuesto(puestoSeleccionado, p)) {
    if (puestosSolicitados.length > 0) {
      const primerIdx = catalogoPuestos.findIndex(cp => esMismoPuesto(cp, puestosSolicitados[0]));
      if (primerIdx >= 0) {
        document.getElementById('selectPuesto').value = primerIdx;
        seleccionarPuesto(primerIdx);
      }
    }
  }

  renderizarListaOrdenablePuestos();
  renderizarChecklistPuestos();
  renderizarPillsPuestos();
  recalcular();
}

function seleccionarPuestoPorId(pId) {
  const idx = catalogoPuestos.findIndex(cp => esMismoPuesto(cp, pId));
  if (idx >= 0) {
    document.getElementById('selectPuesto').value = idx;
    seleccionarPuesto(idx);
    renderizarListaOrdenablePuestos();
    renderizarChecklistPuestos();
    renderizarPillsPuestos();
    recalcular();
  }
}

function seleccionarPuestoParaVer(idx) {
  const p = catalogoPuestos[idx];
  if (p && !puestosSolicitados.some(ps => esMismoPuesto(ps, p))) {
    puestosSolicitados.push({
      ...p,
      orden: puestosSolicitados.length + 1
    });
  }
  document.getElementById('selectPuesto').value = idx;
  seleccionarPuesto(idx);
  renderizarListaOrdenablePuestos();
  renderizarChecklistPuestos();
  renderizarPillsPuestos();
}

function renderizarPillsPuestos() {
  const container = document.getElementById('pillsPuestosSolicitados');
  if (!container) return;
  container.innerHTML = '';

  if (puestosSolicitados.length === 0) {
    container.innerHTML = `<span style="font-size:0.75rem; color:#94a3b8; font-style:italic;">No has marcado ningún puesto. Marca al menos uno en el formulario de la izquierda.</span>`;
    return;
  }

  puestosSolicitados.forEach((ps, i) => {
    const esActivo = puestoSeleccionado && esMismoPuesto(puestoSeleccionado, ps);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `puesto-pill-btn ${esActivo ? 'active' : ''}`;
    
    let scoreSnippet = '';
    if (esActivo && ultimoCalculo) {
      scoreSnippet = ` • ${ultimoCalculo.puntuacionFinal.toFixed(2)} pts (${ultimoCalculo.superaMinimo ? '✓ Apto' : '✕ No corte'})`;
    }

    const shortService = ps.servicio ? ` (${ps.servicio.split('/')[0].slice(0, 20)})` : '';
    btn.innerHTML = `<span>${ps.orden || (i+1)}ª</span> <strong>[${ps.codigoRpt || ps.id}] ${ps.tipo}${shortService}</strong> <small>${scoreSnippet}</small>`;
    btn.addEventListener('click', () => {
      const idx = catalogoPuestos.findIndex(cp => esMismoPuesto(cp, ps));
      if (idx >= 0) {
        document.getElementById('selectPuesto').value = idx;
        seleccionarPuesto(idx);
        renderizarChecklistPuestos();
        renderizarPillsPuestos();
      }
    });
    container.appendChild(btn);
  });
}

function seleccionarPuesto(index) {
  puestoSeleccionado = catalogoPuestos[index];
  if (!puestoSeleccionado) return;

  const banner = document.getElementById('puestoInfoBanner');
  if (banner) banner.style.display = 'block';

  const elCod = document.getElementById('tagCodigoRPT');
  if (elCod) elCod.textContent = puestoSeleccionado.codigoRpt || puestoSeleccionado.id;

  const elTipo = document.getElementById('tagTipoPuestoNombre');
  if (elTipo) elTipo.textContent = puestoSeleccionado.tipo;

  const elUnico = document.getElementById('tagPuestoUnicoBadge');
  if (elUnico) elUnico.style.display = puestoSeleccionado.esPuestoUnico ? 'inline-block' : 'none';

  const elServ = document.getElementById('tagServicioPuesto');
  if (elServ) elServ.textContent = `${puestoSeleccionado.servicio || '-'}${puestoSeleccionado.unidad ? ' / ' + puestoSeleccionado.unidad : ''}`;

  const elLoc = document.getElementById('tagLocalizacionPuesto');
  if (elLoc) elLoc.textContent = `${puestoSeleccionado.localizacion || 'Santa Cruz de Tenerife'} (${puestoSeleccionado.entidad || 'Cabildo Insular'})`;

  document.getElementById('tagFormaProvision').textContent = puestoSeleccionado.formaProvision;
  document.getElementById('tagNivelCD').textContent = `CD: ${puestoSeleccionado.cd} / CE: ${puestoSeleccionado.ce || '-'}`;
  document.getElementById('tagDotaciones').textContent = `${puestoSeleccionado.dotaciones || 1} Vacante`;
  
  const secConcil = document.getElementById('seccionConciliacion');
  const avisoConcil = document.getElementById('avisoConcilEspecifico');
  const badgeConcil = document.getElementById('badgeConcilTipo');

  if (puestoSeleccionado.formaProvision === 'Concurso específico') {
    document.getElementById('tagMinimoExigido').textContent = `Fase 1: 2.50 | Fase 2: 1.50 | Total: 4.00 ptos`;
    if (secConcil) {
      secConcil.style.display = 'block';
      secConcil.style.opacity = '0.85';
    }
    if (avisoConcil) avisoConcil.style.display = 'block';
    if (badgeConcil) {
      badgeConcil.textContent = 'No barema en C. Específico';
      badgeConcil.className = 'badge badge-warning';
    }
  } else {
    document.getElementById('tagMinimoExigido').textContent = `Mínimo: ${(puestoSeleccionado.minimoSuperar || 1.5).toFixed(2)} ptos`;
    if (secConcil) {
      secConcil.style.display = 'block';
      secConcil.style.opacity = '1';
    }
    if (avisoConcil) avisoConcil.style.display = 'none';
    if (badgeConcil) {
      badgeConcil.textContent = 'Puntúa hasta 1,00 pto';
      badgeConcil.className = 'badge badge-info';
    }
  }

  document.getElementById('descRequisitoExp').textContent = `Requisito de experiencia: ${puestoSeleccionado.requisitoExperiencia || 'Plaza vinculada'}`;
  renderizarChecklistPuestos();
  renderizarPillsPuestos();
  recalcular();
}

// Sincronizar automáticamente la antigüedad a partir de los Servicios Prestados
function sincronizarAntiguedadAutomatica() {
  const chk = document.getElementById('chkAutoAntiguedad');
  if (!chk || !chk.checked) return;

  let totalVinculada = 0;
  let totalOtras = 0;

  meritoActual.experiencia.forEach(exp => {
    const d = parseInt(exp.dias, 10) || 0;
    if (exp.tipoPlaza === 'otra') {
      totalOtras += d;
    } else {
      totalVinculada += d;
    }
  });

  document.getElementById('inputAntigVinculada').value = totalVinculada;
  document.getElementById('inputAntigOtras').value = totalOtras;

  const bVin = document.getElementById('badgeAutoVinculada');
  const bOtr = document.getElementById('badgeAutoOtras');
  if (bVin) bVin.textContent = `${totalVinculada} días`;
  if (bOtr) bOtr.textContent = `${totalOtras} días`;
}

// Configuración de eventos de UI
function configurarEventos() {
  // Navegación entre vistas principales
  document.getElementById('navBtnIndividual').addEventListener('click', () => {
    document.getElementById('navBtnIndividual').classList.add('active');
    document.getElementById('navBtnAdjudicacion').classList.remove('active');
    document.getElementById('vistaIndividual').style.display = 'block';
    document.getElementById('vistaAdjudicacion').style.display = 'none';
  });

  document.getElementById('navBtnAdjudicacion').addEventListener('click', async () => {
    document.getElementById('navBtnAdjudicacion').classList.add('active');
    document.getElementById('navBtnIndividual').classList.remove('active');
    document.getElementById('vistaIndividual').style.display = 'none';
    document.getElementById('vistaAdjudicacion').style.display = 'block';

    if (puestoSeleccionado) {
      puestoRankingActual = puestoSeleccionado.id || puestoSeleccionado.codigoRpt;
      const selRank = document.getElementById('selectPuestoRanking');
      if (selRank) selRank.value = puestoRankingActual;
    }

    await cargarCuadroAdjudicacion();
  });

  // Selector puesto en ranking
  document.getElementById('selectPuestoRanking').addEventListener('change', (e) => {
    puestoRankingActual = e.target.value;
    cargarCuadroAdjudicacion();
  });

  // Filtro de búsqueda rápida en el selector de ranking
  const fRank = document.getElementById('filtroTextoRanking');
  if (fRank) {
    fRank.addEventListener('input', (e) => {
      poblarSelectoresPuestos(e.target.value);
    });
  }

  // Filtros de puestos en Tarjeta 1
  const fTxt = document.getElementById('filtroTextoPuestos');
  if (fTxt) fTxt.addEventListener('input', () => renderizarChecklistPuestos());

  const fTipo = document.getElementById('filtroTipoPuestosSelect');
  if (fTipo) fTipo.addEventListener('change', () => renderizarChecklistPuestos());

  const fEnt = document.getElementById('filtroEntidadPuestosSelect');
  if (fEnt) fEnt.addEventListener('change', () => renderizarChecklistPuestos());

  const btnSolo = document.getElementById('btnVerSoloSeleccionados');
  if (btnSolo) {
    btnSolo.addEventListener('click', () => {
      verSoloSeleccionados = !verSoloSeleccionados;
      btnSolo.textContent = verSoloSeleccionados ? '👁️ Ver Todos' : '👁️ Solo Marcados';
      if (verSoloSeleccionados) {
        btnSolo.classList.add('btn-primary');
        btnSolo.classList.remove('btn-outline');
      } else {
        btnSolo.classList.remove('btn-primary');
        btnSolo.classList.add('btn-outline');
      }
      renderizarChecklistPuestos();
    });
  }

  // Exportar Acta de Ranking en Excel
  document.getElementById('btnExportarRankingExcel').addEventListener('click', exportarRankingExcel);

  // Cargar Aspirantes de Muestra para Simulación de concurso
  const btnCargarMuestra = document.getElementById('btnCargarMuestra');
  if (btnCargarMuestra) {
    btnCargarMuestra.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/aspirantes/cargar-muestra', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          await actualizarContadorAspirantes();
          await cargarCuadroAdjudicacion();
          mostrarToast('Simulación Cargada', 'Se han incorporado candidatos de prueba. Ahora puedes ver las adjudicaciones y listas de reserva completas.');
        } else {
          alert('Error al cargar muestras: ' + (data.error || 'Error desconocido'));
        }
      } catch (err) {
        alert('Error al cargar candidatos de prueba: ' + err.message);
      }
    });
  }

  // Cambio de puesto en individual
  document.getElementById('selectPuesto').addEventListener('change', (e) => {
    seleccionarPuesto(parseInt(e.target.value, 10));
  });

  // Checkbox de cálculo automático de antigüedad
  const chkAuto = document.getElementById('chkAutoAntiguedad');
  if (chkAuto) {
    chkAuto.addEventListener('change', (e) => {
      if (e.target.checked) {
        sincronizarAntiguedadAutomatica();
        recalcular();
      }
    });
  }

  // Detección inteligente de carácter de curso al escribir en el modal
  const mTitulo = document.getElementById('mCursoTitulo');
  if (mTitulo) {
    mTitulo.addEventListener('input', (e) => {
      const val = e.target.value.toLowerCase();
      const sel = document.getElementById('mCursoCaracter');
      if (val.includes('transver') || val.includes('general') || val.includes('igualdad') || val.includes('prevenc') || val.includes('etica') || val.includes('calidad') || val.includes('habilidad')) {
        sel.value = 'General / Transversal';
      } else if (val.includes('espec') || val.includes('procedim') || val.includes('ofim') || val.includes('contab') || val.includes('tribut') || val.includes('jurid')) {
        sel.value = 'Específico';
      }
    });
  }

  // Cambios en inputs de formulario
  ['selectGrado', 'inputAntigVinculada', 'inputAntigOtras', 'chkConcilHijos', 'chkConcilConyuge'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', recalcular);
  });

  // Situación de adscripción y participación en resultas
  const selSitAdmin = document.getElementById('selectSituacionAdmin');
  const chkRes = document.getElementById('chkParticipaResultas');
  const chkSolo = document.getElementById('chkSoloResultas');
  const chkRen = document.getElementById('chkRenunciaResultas');
  const helpProv = document.getElementById('helpResultasProvisional');
  if (selSitAdmin && chkRes) {
    selSitAdmin.addEventListener('change', () => {
      if (selSitAdmin.value === 'provisional') {
        chkRes.checked = true;
        chkRes.disabled = true;
        if (chkRen) { chkRen.checked = false; chkRen.disabled = true; }
        if (helpProv) helpProv.style.display = 'block';
      } else {
        chkRes.disabled = false;
        if (chkRen) chkRen.disabled = false;
        if (helpProv) helpProv.style.display = 'none';
      }
    });
  }

  if (chkRen && chkRes) {
    chkRen.addEventListener('change', (e) => {
      if (e.target.checked) {
        chkRes.checked = false;
        if (chkSolo) chkSolo.checked = false;
      } else {
        chkRes.checked = true;
      }
    });
  }

  if (chkSolo && chkRes) {
    chkSolo.addEventListener('change', (e) => {
      if (e.target.checked) {
        chkRes.checked = true;
        if (chkRen) chkRen.checked = false;
      }
    });
  }

  // Botón Nuevo Aspirante
  document.getElementById('btnNuevoAspirante').addEventListener('click', () => {
    if (confirm('¿Deseas iniciar la baremación de un nuevo aspirante? Se limpiará el formulario actual.')) {
      limpiarFormularioAspirante();
    }
  });

  // Botones para marcar o desmarcar todos los puestos
  const btnMarcar = document.getElementById('btnMarcarTodosPuestos');
  if (btnMarcar) {
    btnMarcar.addEventListener('click', () => {
      puestosSolicitados = catalogoPuestos.map((p, i) => ({ ...p, orden: i + 1 }));
      renderizarChecklistPuestos();
      renderizarPillsPuestos();
      recalcular();
    });
  }

  const btnDesmarcar = document.getElementById('btnDesmarcarPuestos');
  if (btnDesmarcar) {
    btnDesmarcar.addEventListener('click', () => {
      puestosSolicitados = [];
      renderizarListaOrdenablePuestos();
      renderizarChecklistPuestos();
      renderizarPillsPuestos();
      recalcular();
    });
  }

  // Botones Guardar Aspirante en el Concurso (Tanto cabecera como panel inferior)
  const btnGuardarHeader = document.getElementById('btnGuardarAspiranteHeader');
  if (btnGuardarHeader) btnGuardarHeader.addEventListener('click', guardarAspiranteConcurso);

  const btnGuardarMain = document.getElementById('btnGuardarAspirante');
  if (btnGuardarMain) btnGuardarMain.addEventListener('click', guardarAspiranteConcurso);

  // Botones Descargar Excel Individual
  const btnExcelHeader = document.getElementById('btnDescargarExcelHeader');
  if (btnExcelHeader) btnExcelHeader.addEventListener('click', descargarExcelIndividual);

  const btnExcelMain = document.getElementById('btnDescargarExcelMain');
  if (btnExcelMain) btnExcelMain.addEventListener('click', descargarExcelIndividual);

  // Pestañas de méritos
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.getAttribute('data-tab')).classList.add('active');
    });
  });

  // Drag and Drop
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    }, false);
  });

  dropZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) procesarArchivos(files);
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) procesarArchivos(e.target.files);
  });

  const folderInput = document.getElementById('folderInput');
  if (folderInput) {
    folderInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) procesarArchivos(e.target.files);
    });
  }

  const btnEscanear = document.getElementById('btnEscanearRuta');
  if (btnEscanear) {
    btnEscanear.addEventListener('click', async () => {
      const ruta = document.getElementById('inputRutaCarpeta').value.trim();
      if (!ruta) {
        alert('Por favor, indica una ruta de carpeta válida de tu ordenador.');
        return;
      }
      await escanearCarpetaRuta(ruta);
    });
  }

  // Modales
  document.getElementById('btnNuevoCurso').addEventListener('click', () => {
    abrirModalNuevoCurso();
  });

  document.getElementById('btnNuevaExp').addEventListener('click', () => {
    abrirModalNuevaExp();
  });

  document.getElementById('btnGuardarCurso').addEventListener('click', guardarCursoModal);
  document.getElementById('btnGuardarExp').addEventListener('click', guardarExpModal);

  const btnGuardarModalPuesto = document.getElementById('btnGuardarNuevoPuestoModal');
  if (btnGuardarModalPuesto) {
    btnGuardarModalPuesto.addEventListener('click', guardarNuevoPuestoModal);
  }

  document.getElementById('btnNuevaTitulacion').addEventListener('click', agregarTitulacionPrompt);
  document.getElementById('btnNuevoIdioma').addEventListener('click', agregarIdiomaPrompt);
}

function limpiarFormularioAspirante() {
  document.getElementById('inputNombre').value = '';
  document.getElementById('inputDNI').value = '';
  const selSit = document.getElementById('selectSituacionAdmin');
  if (selSit) selSit.value = 'definitiva';
  const inpOrig = document.getElementById('inputPuestoOrigen');
  if (inpOrig) inpOrig.value = '';
  const chkRes = document.getElementById('chkParticipaResultas');
  if (chkRes) {
    chkRes.checked = true;
    chkRes.disabled = false;
  }
  const chkSolo = document.getElementById('chkSoloResultas');
  if (chkSolo) chkSolo.checked = false;
  const chkRen = document.getElementById('chkRenunciaResultas');
  if (chkRen) {
    chkRen.checked = false;
    chkRen.disabled = false;
  }
  const helpProv = document.getElementById('helpResultasProvisional');
  if (helpProv) helpProv.style.display = 'none';

  document.getElementById('inputAntigVinculada').value = '0';
  document.getElementById('inputAntigOtras').value = '0';
  document.getElementById('chkConcilHijos').checked = false;
  document.getElementById('chkConcilConyuge').checked = false;
  meritoActual = { cursos: [], experiencia: [], titulaciones: [], idiomas: [], archivosProcesados: [] };
  if (catalogoPuestos.length > 0) {
    puestosSolicitados = [{ ...catalogoPuestos[0], orden: 1 }];
    document.getElementById('selectPuesto').value = 0;
    seleccionarPuesto(0);
  }
  cambiarVistaPuestos('solicitados');
  renderizarListaOrdenablePuestos();
  renderizarChecklistPuestos();
  renderizarPillsPuestos();
  actualizarVistas();
  recalcular();
}

// Subida y procesamiento de documentos
async function procesarArchivos(files) {
  const statusEl = document.getElementById('uploadStatus');
  statusEl.style.display = 'flex';

  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append('documentos', files[i]);
  }

  try {
    const res = await fetch('/api/upload-document', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (data.resultados) {
      data.resultados.forEach(resArchivo => {
        if (!resArchivo.success) {
          alert(`Error en ${resArchivo.archivo}: ${resArchivo.error}`);
          return;
        }

        if (resArchivo.datosCandidato.nombre && !document.getElementById('inputNombre').value) {
          document.getElementById('inputNombre').value = resArchivo.datosCandidato.nombre;
        }
        if (resArchivo.datosCandidato.dni && !document.getElementById('inputDNI').value) {
          document.getElementById('inputDNI').value = resArchivo.datosCandidato.dni;
        }

        if (resArchivo.gradoDetectado) {
          const selectGrado = document.getElementById('selectGrado');
          if (selectGrado) selectGrado.value = resArchivo.gradoDetectado.toString();
        }

        if (resArchivo.cursos && resArchivo.cursos.length > 0) {
          meritoActual.cursos.push(...resArchivo.cursos);
        }

        if (resArchivo.experiencia && resArchivo.experiencia.length > 0) {
          resArchivo.experiencia.forEach(e => {
            if (!e.tipoPlaza) e.tipoPlaza = 'vinculada';
          });
          meritoActual.experiencia.push(...resArchivo.experiencia);
        }

        if (resArchivo.titulaciones && resArchivo.titulaciones.length > 0) {
          meritoActual.titulaciones.push(...resArchivo.titulaciones);
        }

        if (resArchivo.idiomas && resArchivo.idiomas.length > 0) {
          meritoActual.idiomas.push(...resArchivo.idiomas);
        }

        meritoActual.archivosProcesados.push(resArchivo);
      });

      sincronizarAntiguedadAutomatica();
      actualizarVistas();
      await recalcular();
      mostrarToast('Documentos Procesados', `${files.length} archivo(s) analizados y méritos extraídos.`);
    }
  } catch (err) {
    alert('Error al procesar archivos: ' + err.message);
  } finally {
    statusEl.style.display = 'none';
    document.getElementById('fileInput').value = '';
  }
}

// Actualizar listas y tablas en la interfaz
function actualizarVistas() {
  const listaArchivos = document.getElementById('listaArchivos');
  listaArchivos.innerHTML = '';
  meritoActual.archivosProcesados.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'file-item';
    div.innerHTML = `
      <div class="file-name">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        ${item.archivo}
      </div>
      <div>
        <span class="file-tag">${item.tipoDocumentoEstimado || 'Procesado'}</span>
        <button class="btn btn-sm btn-outline" onclick="verTextoExtraido(${index})" style="padding:1px 6px; font-size:0.7rem; margin-right:4px;">Ver Texto</button>
        <button class="btn-icon-danger" onclick="eliminarArchivo(${index})" title="Eliminar archivo">&times;</button>
      </div>
    `;
    listaArchivos.appendChild(div);
  });

  // Contadores
  document.getElementById('countCursos').textContent = meritoActual.cursos.length;
  document.getElementById('countExp').textContent = meritoActual.experiencia.length;
  document.getElementById('countOtros').textContent = meritoActual.titulaciones.length + meritoActual.idiomas.length;

  // Tabla Cursos (Separada en Bloque Específico y Bloque General)
  renderizarTablasCursos();

  // Tabla Experiencia
  const tbodyExp = document.getElementById('tbodyExp');
  if (meritoActual.experiencia.length === 0) {
    tbodyExp.innerHTML = `<tr><td colspan="7" class="text-center empty-state">No hay períodos de experiencia. Sube certificados o pulsa "+ Añadir Período".</td></tr>`;
  } else {
    tbodyExp.innerHTML = '';
    meritoActual.experiencia.forEach((exp, idx) => {
      const tr = document.createElement('tr');
      const ptsVal = exp.puntosBrutos !== undefined ? exp.puntosBrutos.toFixed(4) : '...';
      const esVinculada = (exp.tipoPlaza !== 'otra');

      tr.innerHTML = `
        <td>
          <input type="text" value="${exp.puesto || 'Auxiliar Administrativo/a'}" 
            onchange="cambiarPuestoExp(${idx}, this.value)" 
            class="form-control" 
            style="padding: 2px 6px; font-size: 0.8rem; font-weight:600; min-width: 150px;">
          <small class="help-text">
            <select onchange="cambiarTipoPlazaExp(${idx}, this.value)" style="border:none; background:#f1f5f9; padding:1px 4px; border-radius:3px; font-size:0.7rem;">
              <option value="vinculada" ${esVinculada ? 'selected' : ''}>Plaza vinculada (Auxiliar)</option>
              <option value="otra" ${!esVinculada ? 'selected' : ''}>Otra plaza de AAPP</option>
            </select>
          </small>
        </td>
        <td>${exp.administracion}</td>
        <td><span class="badge badge-neutral">Nivel ${exp.cd}</span></td>
        <td>
          <div style="display:flex; align-items:center; gap:3px;">
            <input type="number" value="${exp.dias}" min="1" 
              onchange="cambiarDiasExp(${idx}, this.value)" 
              class="form-control" 
              style="width: 75px; padding: 2px 6px; font-size: 0.8rem; font-weight:600; text-align:right;">
            <span style="font-size:0.75rem; color:#64748b;">días</span>
          </div>
        </td>
        <td>
          <label style="display:flex; align-items:center; gap:4px; font-size:0.775rem; cursor:pointer;">
            <input type="checkbox" ${exp.esEspecificaAmbito ? 'checked' : ''} onchange="toggleExpAmbito(${idx}, this.checked)">
            <span>En ámbito Servicio</span>
          </label>
        </td>
        <td><span class="badge badge-info badge-puntos-exp" id="badgePtsExp_${idx}">${ptsVal} pts</span></td>
        <td>
          <div style="display:flex; gap:4px;">
            <button class="btn-icon-edit" onclick="abrirModalEditarExp(${idx})" title="Editar período">✏️</button>
            <button class="btn-icon-danger" onclick="eliminarExp(${idx})" title="Eliminar">&times;</button>
          </div>
        </td>
      `;
      tbodyExp.appendChild(tr);
    });
  }

  // Titulaciones
  const listaTit = document.getElementById('listaTitulaciones');
  listaTit.innerHTML = '';
  meritoActual.titulaciones.forEach((tit, idx) => {
    const div = document.createElement('div');
    div.className = 'merit-pill';
    div.innerHTML = `
      <span>🎓 <strong>${tit.tipo}</strong>: ${tit.denominacion || ''}</span>
      <button class="btn-icon-danger" onclick="eliminarTitulacion(${idx})">&times;</button>
    `;
    listaTit.appendChild(div);
  });

  // Idiomas
  const listaId = document.getElementById('listaIdiomas');
  listaId.innerHTML = '';
  meritoActual.idiomas.forEach((idm, idx) => {
    const div = document.createElement('div');
    div.className = 'merit-pill';
    div.innerHTML = `
      <span>🗣️ <strong>${idm.idioma}</strong> - Nivel MCER: <strong>${idm.nivel}</strong></span>
      <button class="btn-icon-danger" onclick="eliminarIdioma(${idx})">&times;</button>
    `;
    listaId.appendChild(div);
  });
}

// Renderizar cursos separados por Formación Específica y Formación General / Transversal
function renderizarTablasCursos() {
  const tbodyEsp = document.getElementById('tbodyCursosEsp');
  const tbodyGen = document.getElementById('tbodyCursosGen');
  if (!tbodyEsp || !tbodyGen) return;

  tbodyEsp.innerHTML = '';
  tbodyGen.innerHTML = '';

  let espCount = 0;
  let espIncluidos = 0;
  let espHoras = 0;
  let espPuntos = 0;

  let genCount = 0;
  let genIncluidos = 0;
  let genHoras = 0;
  let genPuntos = 0;

  meritoActual.cursos.forEach((curso, idx) => {
    if (curso.incluido === undefined) {
      curso.incluido = true;
    }

    const esEsp = (curso.caracter === 'Específico' || (curso.caracter || '').toLowerCase().includes('espec') || curso.esEspecifico);
    const inc = (curso.incluido !== false && curso.activo !== false);
    const horas = parseFloat(curso.horas) || 0;
    const pts = parseFloat(curso.puntosBrutos) || 0;

    const tr = document.createElement('tr');
    if (!inc) {
      tr.className = 'curso-fila-excluida';
    }

    const badgePtsHtml = inc
      ? `<span class="badge badge-info badge-puntos-curso" id="badgePtsCurso_${idx}">${pts.toFixed(4)} pts</span>`
      : `<span class="badge badge-neutral badge-puntos-curso" id="badgePtsCurso_${idx}" title="Excluido de la baremación">0.0000 pts (Excluido)</span>`;

    tr.innerHTML = `
      <td style="text-align:center;">
        <input type="checkbox" class="chk-curso-inclusion" 
          ${inc ? 'checked' : ''} 
          onchange="toggleInclusionCurso(${idx}, this.checked)" 
          title="${inc ? 'Desmarcar para excluir del cómputo' : 'Marcar para incluir en el cómputo'}">
      </td>
      <td>
        <div style="display:flex; align-items:center; gap:6px;">
          <input type="text" value="${curso.titulo || 'Curso sin título'}" 
            onchange="cambiarTituloCurso(${idx}, this.value)" 
            class="form-control" 
            style="padding: 3px 6px; font-size: 0.825rem; font-weight:600; min-width: 170px;">
        </div>
        <small class="help-text" style="display:flex; justify-content:space-between; align-items:center; margin-top:2px;">
          <span>${curso.origenArchivo || 'Añadido manualmente'}</span>
          ${!inc ? '<span style="color:#b91c1c; font-weight:700;">⛔ Excluido</span>' : ''}
        </small>
      </td>
      <td>
        <div style="display:flex; align-items:center; gap:3px;">
          <input type="number" value="${curso.horas}" min="1" step="0.5" 
            onchange="cambiarHorasCurso(${idx}, this.value)" 
            class="form-control" 
            style="width: 65px; padding: 3px 6px; font-size: 0.825rem; font-weight:600; text-align:right;">
          <span style="font-size:0.75rem; color:#64748b;">h</span>
        </div>
      </td>
      <td>
        <select onchange="cambiarTipoCurso(${idx}, this.value)" class="form-control" style="padding: 3px 5px; font-size: 0.775rem;">
          <option value="Aprovechamiento" ${curso.tipo === 'Aprovechamiento' ? 'selected' : ''}>Aprovechamiento / Impart.</option>
          <option value="Asistencia" ${curso.tipo === 'Asistencia' ? 'selected' : ''}>Asistencia</option>
        </select>
      </td>
      <td>
        <select onchange="cambiarCaracterCurso(${idx}, this.value)" class="form-control" style="padding: 3px 5px; font-size: 0.775rem; font-weight:600; color: ${esEsp ? '#1e40af' : '#475569'};">
          <option value="Específico" ${esEsp ? 'selected' : ''}>Específico (Puesto)</option>
          <option value="General / Transversal" ${!esEsp ? 'selected' : ''}>General / Transversal</option>
        </select>
      </td>
      <td>${badgePtsHtml}</td>
      <td>
        <div style="display:flex; gap:3px;">
          <button class="btn-icon-edit" onclick="abrirModalEditarCurso(${idx})" title="Editar curso completo">✏️</button>
          <button class="btn-icon-danger" onclick="eliminarCurso(${idx})" title="Eliminar">&times;</button>
        </div>
      </td>
    `;

    if (esEsp) {
      espCount++;
      if (inc) {
        espIncluidos++;
        espHoras += horas;
        espPuntos += pts;
      }
      tbodyEsp.appendChild(tr);
    } else {
      genCount++;
      if (inc) {
        genIncluidos++;
        genHoras += horas;
        genPuntos += pts;
      }
      tbodyGen.appendChild(tr);
    }
  });

  if (espCount === 0) {
    tbodyEsp.innerHTML = `<tr><td colspan="7" class="text-center empty-state">No hay cursos específicos registrados. Sube certificados o pulsa "+ Añadir Curso".</td></tr>`;
  }
  if (genCount === 0) {
    tbodyGen.innerHTML = `<tr><td colspan="7" class="text-center empty-state">No hay cursos generales registrados. Sube certificados o pulsa "+ Añadir Curso".</td></tr>`;
  }

  // Actualizar badges de resumen
  const badgeEsp = document.getElementById('badgeCursosEspResumen');
  if (badgeEsp) {
    badgeEsp.textContent = `${espIncluidos}/${espCount} incluidos • ${espHoras} h • ${espPuntos.toFixed(4)} pts`;
  }
  const badgeGen = document.getElementById('badgeCursosGenResumen');
  if (badgeGen) {
    badgeGen.textContent = `${genIncluidos}/${genCount} incluidos • ${genHoras} h • ${genPuntos.toFixed(4)} pts`;
  }
}

// Activar o desactivar inclusión de un curso individual
function toggleInclusionCurso(idx, checked) {
  if (meritoActual.cursos[idx]) {
    meritoActual.cursos[idx].incluido = checked;
    actualizarVistas();
    recalcular();
  }
}

// Marcar o desmarcar todos los cursos de una categoría
function marcarTodosCursos(tipo, checked) {
  meritoActual.cursos.forEach(c => {
    const esEsp = (c.caracter === 'Específico' || (c.caracter || '').toLowerCase().includes('espec') || c.esEspecifico);
    if ((tipo === 'especifico' && esEsp) || (tipo === 'general' && !esEsp)) {
      c.incluido = checked;
    }
  });
  actualizarVistas();
  recalcular();
}

// Colapsar o expandir sección de cursos
function toggleSeccionCursos(tipo) {
  const body = document.getElementById(tipo === 'especifico' ? 'bodyCursosEsp' : 'bodyCursosGen');
  const btn = document.getElementById(tipo === 'especifico' ? 'btnToggleEsp' : 'btnToggleGen');
  if (body) {
    body.classList.toggle('collapsed');
    if (btn) btn.textContent = body.classList.contains('collapsed') ? '▼' : '▲';
  }
}

// Modificar título u horas directamente desde la tabla
function cambiarTituloCurso(idx, val) {
  if (meritoActual.cursos[idx]) {
    meritoActual.cursos[idx].titulo = val.trim() || 'Curso sin título';
  }
}

function cambiarHorasCurso(idx, val) {
  const horas = parseFloat(val) || 0;
  if (meritoActual.cursos[idx]) {
    meritoActual.cursos[idx].horas = horas;
    recalcular();
  }
}

function cambiarTipoCurso(idx, val) {
  if (meritoActual.cursos[idx]) {
    meritoActual.cursos[idx].tipo = val;
    recalcular();
  }
}

function cambiarCaracterCurso(idx, val) {
  if (meritoActual.cursos[idx]) {
    meritoActual.cursos[idx].caracter = val;
    meritoActual.cursos[idx].esEspecifico = (val === 'Específico');
    actualizarVistas();
    recalcular();
  }
}

function cambiarDiasExp(idx, val) {
  const dias = parseInt(val, 10) || 0;
  if (meritoActual.experiencia[idx]) {
    meritoActual.experiencia[idx].dias = dias;
    sincronizarAntiguedadAutomatica();
    recalcular();
  }
}

function cambiarPuestoExp(idx, val) {
  if (meritoActual.experiencia[idx]) {
    meritoActual.experiencia[idx].puesto = val.trim();
  }
}

// Actualizar badges de puntos en las tablas del DOM inmediatamente
function actualizarCeldasPuntosDOM() {
  meritoActual.cursos.forEach((c, idx) => {
    const badge = document.getElementById(`badgePtsCurso_${idx}`);
    if (badge) {
      const inc = (c.incluido !== false && c.activo !== false);
      if (!inc) {
        badge.textContent = `0.0000 pts (Excluido)`;
        badge.className = 'badge badge-neutral badge-puntos-curso';
      } else if (c.puntosBrutos !== undefined) {
        badge.textContent = `${c.puntosBrutos.toFixed(4)} pts`;
        badge.className = 'badge badge-info badge-puntos-curso';
      }
    }
  });

  meritoActual.experiencia.forEach((e, idx) => {
    const badge = document.getElementById(`badgePtsExp_${idx}`);
    if (badge && e.puntosBrutos !== undefined) {
      badge.textContent = `${e.puntosBrutos.toFixed(4)} pts`;
    }
  });

  // Actualizar también los badges de resumen
  let espCount = 0, espIncluidos = 0, espHoras = 0, espPuntos = 0;
  let genCount = 0, genIncluidos = 0, genHoras = 0, genPuntos = 0;

  meritoActual.cursos.forEach(c => {
    const esEsp = (c.caracter === 'Específico' || (c.caracter || '').toLowerCase().includes('espec') || c.esEspecifico);
    const inc = (c.incluido !== false && c.activo !== false);
    const h = parseFloat(c.horas) || 0;
    const pts = parseFloat(c.puntosBrutos) || 0;

    if (esEsp) {
      espCount++;
      if (inc) { espIncluidos++; espHoras += h; espPuntos += pts; }
    } else {
      genCount++;
      if (inc) { genIncluidos++; genHoras += h; genPuntos += pts; }
    }
  });

  const badgeEsp = document.getElementById('badgeCursosEspResumen');
  if (badgeEsp) {
    badgeEsp.textContent = `${espIncluidos}/${espCount} incluidos • ${espHoras} h • ${espPuntos.toFixed(4)} pts`;
  }
  const badgeGen = document.getElementById('badgeCursosGenResumen');
  if (badgeGen) {
    badgeGen.textContent = `${genIncluidos}/${genCount} incluidos • ${genHoras} h • ${genPuntos.toFixed(4)} pts`;
  }
}

function cambiarTipoPlazaExp(idx, val) {
  meritoActual.experiencia[idx].tipoPlaza = val;
  sincronizarAntiguedadAutomatica();
  recalcular();
}

function eliminarCurso(idx) {
  meritoActual.cursos.splice(idx, 1);
  actualizarVistas();
  recalcular();
}

function toggleExpAmbito(idx, val) {
  meritoActual.experiencia[idx].esEspecificaAmbito = val;
  recalcular();
}

function eliminarExp(idx) {
  meritoActual.experiencia.splice(idx, 1);
  sincronizarAntiguedadAutomatica();
  actualizarVistas();
  recalcular();
}

function eliminarTitulacion(idx) {
  meritoActual.titulaciones.splice(idx, 1);
  actualizarVistas();
  recalcular();
}

function eliminarIdioma(idx) {
  meritoActual.idiomas.splice(idx, 1);
  actualizarVistas();
  recalcular();
}

function eliminarArchivo(idx) {
  const archivoNombre = meritoActual.archivosProcesados[idx].archivo;
  meritoActual.cursos = meritoActual.cursos.filter(c => c.origenArchivo !== archivoNombre);
  meritoActual.experiencia = meritoActual.experiencia.filter(e => e.origenArchivo !== archivoNombre);
  meritoActual.titulaciones = meritoActual.titulaciones.filter(t => t.origenArchivo !== archivoNombre);
  meritoActual.idiomas = meritoActual.idiomas.filter(i => i.origenArchivo !== archivoNombre);
  meritoActual.archivosProcesados.splice(idx, 1);
  sincronizarAntiguedadAutomatica();
  actualizarVistas();
  recalcular();
}

// Baremación individual en tiempo real
async function recalcular() {
  if (!puestoSeleccionado) return;

  sincronizarAntiguedadAutomatica();

  const candidateData = {
    nombre: document.getElementById('inputNombre').value,
    dni: document.getElementById('inputDNI').value,
    puestoSolicitado: puestoSeleccionado,
    gradoPersonal: document.getElementById('selectGrado').value,
    conciliacionHijos: document.getElementById('chkConcilHijos').checked,
    conciliacionConyuge: document.getElementById('chkConcilConyuge').checked,
    antiguedadVinculadaDias: parseInt(document.getElementById('inputAntigVinculada').value, 10) || 0,
    antiguedadOtrasDias: parseInt(document.getElementById('inputAntigOtras').value, 10) || 0,
    titulaciones: meritoActual.titulaciones,
    idiomas: meritoActual.idiomas
  };

  try {
    const res = await fetch('/api/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidateData,
        merits: {
          cursos: meritoActual.cursos,
          experiencia: meritoActual.experiencia,
          titulaciones: meritoActual.titulaciones,
          idiomas: meritoActual.idiomas,
          antiguedadVinculadaDias: candidateData.antiguedadVinculadaDias,
          antiguedadOtrasDias: candidateData.antiguedadOtrasDias
        }
      })
    });

    const result = await res.json();
    ultimoCalculo = result;

    if (result.cursosDetalle) {
      result.cursosDetalle.forEach((cd, i) => {
        if (meritoActual.cursos[i]) {
          meritoActual.cursos[i].puntosBrutos = cd.puntosBrutos;
          meritoActual.cursos[i].factorPuntos = cd.factorPuntos;
        }
      });
    }
    if (result.experienciaDetalle) {
      result.experienciaDetalle.forEach((ed, i) => {
        if (meritoActual.experiencia[i]) {
          meritoActual.experiencia[i].puntosBrutos = ed.puntosBrutos;
          meritoActual.experiencia[i].factor = ed.factor;
        }
      });
    }

    actualizarCeldasPuntosDOM();
    renderizarResultadosIndividuales(result);
  } catch (err) {
    console.error('Error calculando:', err);
  }
}

function renderizarResultadosIndividuales(calc) {
  const scoreTotal = document.getElementById('scoreTotal');
  const badgeResultado = document.getElementById('badgeResultadoGlobal');
  const progressBarFill = document.getElementById('progressBarFill');
  const resultadoTitulo = document.getElementById('resultadoTitulo');
  const resultadoSub = document.getElementById('resultadoSub');

  scoreTotal.textContent = calc.puntuacionFinal.toFixed(4);

  const pct = Math.min(100, (calc.puntuacionFinal / 10.0) * 100);
  progressBarFill.style.width = `${pct}%`;

  if (calc.superaMinimo) {
    badgeResultado.className = 'badge-status badge-approved';
    badgeResultado.textContent = '✓ APTO / SUPERA MÍNIMO';
    resultadoTitulo.textContent = 'Apto para provisión del puesto';
  } else {
    badgeResultado.className = 'badge-status badge-rejected';
    badgeResultado.textContent = '✕ NO ALCANZA MÍNIMO';
    resultadoTitulo.textContent = 'No alcanza la puntuación mínima';
  }

  const container = document.getElementById('desgloseContainer');
  const estabaAbiertoEsp = document.getElementById('detailsCursosEspInline')?.open || false;
  const estabaAbiertoGen = document.getElementById('detailsCursosGenInline')?.open || false;
  container.innerHTML = '';

  function generarHtmlAcordeonCursos(tipo, abierto) {
    const esTipoEsp = (tipo === 'especifico');
    const idElem = esTipoEsp ? 'detailsCursosEspInline' : 'detailsCursosGenInline';
    const labelTipo = esTipoEsp ? 'específicos' : 'generales';

    const cursosFiltrados = meritoActual.cursos
      .map((c, i) => ({ ...c, idx: i }))
      .filter(c => {
        const esEsp = (c.caracter === 'Específico' || (c.caracter || '').toLowerCase().includes('espec') || c.esEspecifico);
        return esTipoEsp ? esEsp : !esEsp;
      });

    const incluidos = cursosFiltrados.filter(c => c.incluido !== false && c.activo !== false).length;
    const total = cursosFiltrados.length;

    return `
      <details class="desglose-cursos-accordion" id="${idElem}" ${abierto ? 'open' : ''}>
        <summary>
          <span>📋 Cursos ${labelTipo} (${incluidos}/${total})</span>
          <small style="color:#64748b; font-weight:normal;">${abierto ? 'Plegar ▲' : 'Desplegar ▼'}</small>
        </summary>
        <div class="desglose-cursos-lista">
          ${total === 0 ? `<div style="padding:6px; color:#94a3b8; font-style:italic;">No hay cursos ${labelTipo} registrados</div>` :
            cursosFiltrados.map(c => {
              const inc = (c.incluido !== false && c.activo !== false);
              return `
                <div class="desglose-curso-item ${!inc ? 'excluido' : ''}">
                  <div class="desglose-curso-item-info">
                    <input type="checkbox" class="chk-curso-inclusion" 
                      ${inc ? 'checked' : ''} 
                      onchange="toggleInclusionCurso(${c.idx}, this.checked)"
                      title="${inc ? 'Desmarcar para excluir del cómputo' : 'Marcar para incluir en el cómputo'}">
                    <span title="${c.titulo}">${c.titulo}</span>
                  </div>
                  <div style="display:flex; align-items:center; gap:6px; white-space:nowrap;">
                    <span class="badge badge-neutral" style="font-size:0.7rem;">${c.horas} h</span>
                    <span class="badge ${inc ? 'badge-info' : 'badge-neutral'}" style="font-size:0.7rem;">
                      ${inc ? (c.puntosBrutos !== undefined ? c.puntosBrutos.toFixed(4) : '0.0000') + ' pts' : 'Excluido'}
                    </span>
                  </div>
                </div>
              `;
            }).join('')}
        </div>
      </details>
    `;
  }

  if (calc.tipoConcurso === 'Concurso ordinario') {
    resultadoSub.textContent = `Mínimo de adjudicación: ${calc.minimoExigido.toFixed(2)} ptos`;

    const items = [
      {
        nombre: 'a) Méritos específicos',
        pts: calc.apartados.meritosEspecificos.puntos,
        tope: calc.apartados.meritosEspecificos.tope,
        desc: `Cursos: ${calc.apartados.meritosEspecificos.desglose.cursosEspecificos} | Títulos: ${calc.apartados.meritosEspecificos.desglose.titulaciones} | Idiomas: ${calc.apartados.meritosEspecificos.desglose.idiomas}`
      },
      {
        nombre: 'b) Grado personal',
        pts: calc.apartados.gradoPersonal.puntos,
        tope: calc.apartados.gradoPersonal.tope,
        desc: `Nivel consolidado: ${calc.apartados.gradoPersonal.nivel}`
      },
      {
        nombre: 'c) Trabajo desarrollado',
        pts: calc.apartados.trabajoDesarrollado.puntos,
        tope: calc.apartados.trabajoDesarrollado.tope,
        desc: `Puntos brutos: ${calc.apartados.trabajoDesarrollado.puntosBrutos}`
      },
      {
        nombre: 'd) Cursos generales',
        pts: calc.apartados.cursosFormacion.puntos,
        tope: calc.apartados.cursosFormacion.tope,
        desc: `Puntos brutos: ${calc.apartados.cursosFormacion.puntosBrutos}`
      },
      {
        nombre: 'e) Antigüedad',
        pts: calc.apartados.antiguedad.puntos,
        tope: calc.apartados.antiguedad.tope,
        desc: `Vinculada: ${calc.apartados.antiguedad.desglose.vinculada} | Otras: ${calc.apartados.antiguedad.desglose.otras}`
      },
      {
        nombre: 'f) Conciliación familiar',
        pts: calc.apartados.conciliacion.puntos,
        tope: calc.apartados.conciliacion.tope,
        desc: `Hijos: ${calc.apartados.conciliacion.hijos ? 'Sí (0.5)' : 'No'} | Cónyuge: ${calc.apartados.conciliacion.conyuge ? 'Sí (0.5)' : 'No'}`
      }
    ];

    items.forEach(it => {
      const card = document.createElement('div');
      card.className = 'desglose-item';
      let extraHtml = '';
      if (it.nombre.includes('Méritos específicos')) {
        extraHtml = generarHtmlAcordeonCursos('especifico', estabaAbiertoEsp);
      } else if (it.nombre.includes('Cursos generales')) {
        extraHtml = generarHtmlAcordeonCursos('general', estabaAbiertoGen);
      }

      card.innerHTML = `
        <div class="desglose-item-header">${it.nombre}</div>
        <div class="desglose-score">${it.pts.toFixed(4)} <span class="desglose-tope">/ ${it.tope.toFixed(2)}</span></div>
        <div class="desglose-detail">${it.desc}</div>
        ${extraHtml}
      `;
      container.appendChild(card);
    });
  } else {
    // Concurso específico (2 Fases)
    resultadoSub.textContent = `Fase 1: mín. ${calc.fases.fase1.minimoRequerido.toFixed(2)} | Fase 2: mín. ${calc.fases.fase2.minimoRequerido.toFixed(2)} | Total mín: ${calc.minimoExigido.toFixed(2)}`;

    const cardFase1 = document.createElement('div');
    cardFase1.className = 'desglose-item';
    cardFase1.innerHTML = `
      <div class="desglose-item-header">FASE 1: Méritos Generales</div>
      <div class="desglose-score">${calc.fases.fase1.puntos.toFixed(4)} <span class="desglose-tope">/ 7.00 ptos</span></div>
      <div class="desglose-detail">
        Estado: <strong>${calc.fases.fase1.superada ? 'SUPERADA (Mín. 2.50)' : 'NO SUPERADA'}</strong><br>
        Grado: ${calc.fases.fase1.apartados.gradoPersonal.puntos} | Trabajo: ${calc.fases.fase1.apartados.trabajoDesarrollado.puntos}<br>
        Cursos: ${calc.fases.fase1.apartados.cursosFormacion.puntos} | Antigüedad: ${calc.fases.fase1.apartados.antiguedad.puntos}
      </div>
      ${generarHtmlAcordeonCursos('general', estabaAbiertoGen)}
    `;
    container.appendChild(cardFase1);

    const cardFase2 = document.createElement('div');
    cardFase2.className = 'desglose-item';
    cardFase2.innerHTML = `
      <div class="desglose-item-header">FASE 2: Méritos Específicos</div>
      <div class="desglose-score">${calc.fases.fase2.puntos.toFixed(4)} <span class="desglose-tope">/ 3.00 ptos</span></div>
      <div class="desglose-detail">
        Estado: <strong>${calc.fases.fase2.superada ? 'SUPERADA (Mín. 1.50)' : 'NO SUPERADA'}</strong><br>
        Formación/Títulos/Idiomas: ${calc.fases.fase2.apartados.formacionEspecifica.puntos} / 1.50<br>
        Experiencia en Servicio: ${calc.fases.fase2.apartados.experienciaEspecifica.puntos} / 1.50
      </div>
      ${generarHtmlAcordeonCursos('especifico', estabaAbiertoEsp)}
    `;
    container.appendChild(cardFase2);

    const cardConcilEsp = document.createElement('div');
    cardConcilEsp.className = 'desglose-item';
    cardConcilEsp.style.opacity = '0.85';
    cardConcilEsp.style.background = '#f8fafc';
    cardConcilEsp.innerHTML = `
      <div class="desglose-item-header">Conciliación de la vida personal</div>
      <div class="desglose-score" style="font-size: 1.15rem; color: #64748b;">No barema <span class="desglose-tope">(Solo C. Ordinario)</span></div>
      <div class="desglose-detail">
        La Base Séptima.2 reserva los 10 puntos íntegros a la Fase 1 (7 pts) y a la Fase 2 (3 pts).
      </div>
    `;
    container.appendChild(cardConcilEsp);
  }
}

// Guardar aspirante en el concurso
async function guardarAspiranteConcurso() {
  try {
    let nombre = document.getElementById('inputNombre').value.trim();
    let dni = document.getElementById('inputDNI').value.trim();

    // Si no ha escrito DNI ni Nombre, generar identificadores por defecto para no bloquear el guardado
    if (!dni && !nombre) {
      const badge = document.getElementById('totalAspirantesBadge');
      const numAsp = (badge && parseInt(badge.textContent, 10) >= 0) ? parseInt(badge.textContent, 10) + 1 : 1;
      nombre = 'Aspirante ' + numAsp;
      dni = 'ASP-' + Math.floor(1000 + Math.random() * 9000);
      document.getElementById('inputNombre').value = nombre;
      document.getElementById('inputDNI').value = dni;
    } else if (!nombre) {
      nombre = 'Aspirante (' + dni + ')';
      document.getElementById('inputNombre').value = nombre;
    } else if (!dni) {
      dni = 'ASP-' + Math.floor(1000 + Math.random() * 9000);
      document.getElementById('inputDNI').value = dni;
    }

    // Asegurar que último cálculo esté realizado
    if (!ultimoCalculo) {
      await recalcular();
    }

    const puestoParaGuardar = puestoSeleccionado || catalogoPuestos[0];
    const puestosFinales = (puestosSolicitados.length > 0)
      ? puestosSolicitados
      : [{ ...puestoParaGuardar, orden: 1 }];

    const aspirante = {
      id: dni.toUpperCase(),
      nombre: nombre,
      dni: dni.toUpperCase(),
      puestosSolicitados: puestosFinales,
      puestoSolicitado: puestoParaGuardar,
      situacionAdministrativa: document.getElementById('selectSituacionAdmin')?.value || 'definitiva',
      puestoOrigen: document.getElementById('inputPuestoOrigen')?.value.trim() || '',
      participaResultas: document.getElementById('chkParticipaResultas')?.checked ?? true,
      soloResultas: document.getElementById('chkSoloResultas')?.checked || false,
      renunciaResultas: document.getElementById('chkRenunciaResultas')?.checked || false,
      gradoPersonal: document.getElementById('selectGrado').value,
      conciliacionHijos: document.getElementById('chkConcilHijos').checked,
      conciliacionConyuge: document.getElementById('chkConcilConyuge').checked,
      antiguedadVinculadaDias: parseInt(document.getElementById('inputAntigVinculada').value, 10) || 0,
      antiguedadOtrasDias: parseInt(document.getElementById('inputAntigOtras').value, 10) || 0,
      merits: {
        ...meritoActual,
        antiguedadVinculadaDias: parseInt(document.getElementById('inputAntigVinculada').value, 10) || 0,
        antiguedadOtrasDias: parseInt(document.getElementById('inputAntigOtras').value, 10) || 0
      },
      resultadoCalculo: ultimoCalculo
    };

    const res = await fetch('/api/aspirantes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(aspirante)
    });
    const data = await res.json();
    if (data.success) {
      await actualizarContadorAspirantes();
      const numP = puestosFinales.length;
      mostrarToast('¡Aspirante Guardado con Éxito!', `"${aspirante.nombre}" (${aspirante.dni}) registrado en ${numP} puesto(s) solicitado(s).`);
      
      // Actualizar el puesto seleccionado en el Cuadro de Adjudicación
      puestoRankingActual = puestoParaGuardar.id || puestoParaGuardar.codigoRpt;
      const selRank = document.getElementById('selectPuestoRanking');
      if (selRank) selRank.value = puestoRankingActual;
      
      // Si la vista de adjudicación estuviera activa, recargar ranking de inmediato
      const vistaAdj = document.getElementById('vistaAdjudicacion');
      if (vistaAdj && vistaAdj.style.display !== 'none') {
        await cargarCuadroAdjudicacion();
      }
    } else {
      alert('Error al guardar: ' + (data.error || 'No se pudo guardar el aspirante'));
    }
  } catch (err) {
    alert('Error al guardar aspirante: ' + err.message);
  }
}

async function actualizarContadorAspirantes() {
  try {
    const res = await fetch('/api/aspirantes');
    const lista = await res.json();
    const badge = document.getElementById('totalAspirantesBadge');
    if (badge) badge.textContent = lista.length;
  } catch (e) {}
}

let filtroRankingActivo = 'todos';

// Cargar Cuadro de Adjudicación y Ranking del puesto seleccionado
async function cargarCuadroAdjudicacion() {
  if (!puestoRankingActual) return;
  const tbody = document.getElementById('tbodyRanking');
  tbody.innerHTML = `<tr><td colspan="12" class="text-center empty-state"><div class="spinner" style="margin: 0 auto 8px auto;"></div>Calculando prelación oficial y desempates...</td></tr>`;

  try {
    const res = await fetch(`/api/clasificacion/${encodeURIComponent(puestoRankingActual)}`);
    const data = await res.json();
    datosRankingActual = data;

    // Actualizar Banner Informativo del Puesto en el Ranking
    const banner = document.getElementById('rankingPuestoBanner');
    if (banner && data.puesto) {
      banner.style.display = 'block';
      const elCod = document.getElementById('rankBannerCodigo');
      if (elCod) elCod.textContent = data.puesto.codigoRpt || data.puesto.id;
      const elTipo = document.getElementById('rankBannerTipo');
      if (elTipo) elTipo.textContent = data.puesto.tipo;
      
      const unBadge = document.getElementById('rankBannerUnico');
      if (unBadge) unBadge.style.display = data.puesto.esPuestoUnico ? 'inline-block' : 'none';

      const elForma = document.getElementById('rankBannerForma');
      if (elForma) elForma.textContent = data.puesto.formaProvision;
      const elCd = document.getElementById('rankBannerCD');
      if (elCd) elCd.textContent = `CD: ${data.puesto.cd} / CE: ${data.puesto.ce || '-'}`;
      const elServ = document.getElementById('rankBannerServicio');
      if (elServ) elServ.textContent = `${data.puesto.servicio || '-'}${data.puesto.unidad ? ' (' + data.puesto.unidad + ')' : ''}`;
      const elLoc = document.getElementById('rankBannerLoc');
      if (elLoc) elLoc.textContent = data.puesto.localizacion || 'Santa Cruz de Tenerife';
      const elEnt = document.getElementById('rankBannerEntidad');
      if (elEnt) elEnt.textContent = data.puesto.entidad || 'Cabildo Insular';
    }

    // Conteo por estados (Fase inicial, 1ª Resultas, 2ª Resultas, Reserva, No aptos)
    const adjInicial = data.ranking.filter(r => r.estadoAdjudicacion === 'ADJUDICADO').length;
    const adj1aRes = data.ranking.filter(r => r.estadoAdjudicacion === 'ADJUDICADO 1ª RESULTAS').length;
    const adj2aRes = data.ranking.filter(r => r.estadoAdjudicacion === 'ADJUDICADO 2ª RESULTAS').length;
    const totalAdj = adjInicial + adj1aRes + adj2aRes;
    const reservas = data.ranking.filter(r => r.estadoAdjudicacion === 'RESERVA').length;
    const noAptos = data.ranking.filter(r => r.estadoAdjudicacion === 'NO ALCANZA MÍNIMO').length;

    document.getElementById('statDotaciones').textContent = data.dotaciones;
    document.getElementById('statAspirantes').textContent = data.totalAspirantes;
    document.getElementById('statAdjudicados').textContent = totalAdj;
    document.getElementById('statVacantesRestantes').textContent = `${data.vacantesRestantes} vacantes libres`;
    document.getElementById('statReserva').textContent = reservas;

    // Actualizar contadores de las pestañas
    const cTodos = document.getElementById('countRankTodos');
    if (cTodos) cTodos.textContent = data.ranking.length;
    const cAdj = document.getElementById('countRankAdj');
    if (cAdj) cAdj.textContent = adjInicial;
    const cRes1 = document.getElementById('countRankResultas1');
    if (cRes1) cRes1.textContent = adj1aRes;
    const cRes2 = document.getElementById('countRankResultas2');
    if (cRes2) cRes2.textContent = adj2aRes;
    const cRes = document.getElementById('countRankRes');
    if (cRes) cRes.textContent = reservas;
    const cNo = document.getElementById('countRankNoApto');
    if (cNo) cNo.textContent = noAptos;

    // Actualizar Panel Global de 1ª y 2ª Resultas
    if (data.cuadroResultasGlobal) {
      const q = data.cuadroResultasGlobal;
      const plazas1 = q.plazasLiberadas1aResultas || [];
      const adjs1 = q.adjudicaciones1aResultas || [];
      const plazas2 = q.plazasLiberadas2aResultas || [];
      const adjs2 = q.adjudicaciones2aResultas || [];

      const bTot = document.getElementById('badgeTotalResultasNum');
      if (bTot) bTot.textContent = `${plazas1.length + plazas2.length} plazas liberadas / ${adjs1.length + adjs2.length} adjudicadas`;

      const b1 = document.getElementById('badgeCount1aResultas');
      if (b1) b1.textContent = `${plazas1.length} liberadas / ${adjs1.length} adjudicadas`;

      const b2 = document.getElementById('badgeCount2aResultas');
      if (b2) b2.textContent = `${plazas2.length} liberadas / ${adjs2.length} adjudicadas`;

      // 1ª Resultas - Plazas liberadas
      const elPlazas1 = document.getElementById('listaPlazasLiberadas1aResultas');
      if (elPlazas1) {
        if (plazas1.length === 0) {
          elPlazas1.innerHTML = '<span style="color:#94a3b8; font-style:italic;">No hay plazas liberadas en 1ª resultas.</span>';
        } else {
          elPlazas1.innerHTML = plazas1.map(p => `
            <div style="padding:6px 0; border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center; gap:8px;">
              <div>
                🏢 <strong>[${p.codigoRpt}]</strong> ${p.tipo} - <span style="color:#475569;">${p.servicio}</span>
                <div style="font-size:0.7rem; color:#64748b;">Liberado por: <strong>${p.liberadoPor}</strong> (${p.dniLiberador}) al ganar [${p.nuevoPuestoAdjudicado}]</div>
              </div>
              <button type="button" class="btn btn-sm btn-outline" onclick="incorporarPlazaLiberada('${encodeURIComponent(JSON.stringify(p))}')" style="padding:2px 6px; font-size:0.68rem; white-space:nowrap; background:#f0fdf4; border-color:#86efac; color:#166534;" title="Incorporar este puesto al catálogo oficial para que los aspirantes puedan solicitarlo">
                📥 ${p.estaEnCatalogo ? '✓ En Catálogo' : '+ Ofertar'}
              </button>
            </div>
          `).join('');
        }
      }

      // 1ª Resultas - Adjudicaciones
      const elAdj1 = document.getElementById('listaAdjudicados1aResultas');
      if (elAdj1) {
        if (adjs1.length === 0) {
          elAdj1.innerHTML = '<span style="color:#94a3b8; font-style:italic;">Sin adjudicaciones en 1ª resultas.</span>';
        } else {
          elAdj1.innerHTML = adjs1.map(a => `
            <div style="padding:4px 0; border-bottom:1px solid #f1f5f9;">
              👤 <strong>${a.nombre}</strong> (${a.dni}) ➔ Adjudicado en <strong>[${a.puestoId}] ${a.puestoReal.tipo}</strong> (${a.ordenPreferencia}ª opción)
            </div>
          `).join('');
        }
      }

      // 2ª Resultas - Plazas liberadas (resultas de 2º orden)
      const elPlazas2 = document.getElementById('listaPlazasLiberadas2aResultas');
      if (elPlazas2) {
        if (plazas2.length === 0) {
          elPlazas2.innerHTML = '<span style="color:#94a3b8; font-style:italic;">No hay plazas liberadas en 2ª resultas (segundo orden).</span>';
        } else {
          elPlazas2.innerHTML = plazas2.map(p => `
            <div style="padding:6px 0; border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center; gap:8px;">
              <div>
                🏛️ <strong>[${p.codigoRpt}]</strong> ${p.tipo} - <span style="color:#475569;">${p.servicio}</span>
                <div style="font-size:0.7rem; color:#64748b;">Liberado por: <strong>${p.liberadoPor}</strong> (${p.dniLiberador}) al ganar en 1ª Resultas</div>
              </div>
              <button type="button" class="btn btn-sm btn-outline" onclick="incorporarPlazaLiberada('${encodeURIComponent(JSON.stringify(p))}')" style="padding:2px 6px; font-size:0.68rem; white-space:nowrap; background:#eef2ff; border-color:#c7d2fe; color:#3730a3;" title="Incorporar este puesto al catálogo oficial para 2ª resultas">
                📥 ${p.estaEnCatalogo ? '✓ En Catálogo' : '+ Ofertar'}
              </button>
            </div>
          `).join('');
        }
      }

      // 2ª Resultas - Adjudicaciones
      const elAdj2 = document.getElementById('listaAdjudicados2aResultas');
      if (elAdj2) {
        if (adjs2.length === 0) {
          elAdj2.innerHTML = '<span style="color:#94a3b8; font-style:italic;">Sin adjudicaciones en 2ª resultas.</span>';
        } else {
          elAdj2.innerHTML = adjs2.map(a => `
            <div style="padding:4px 0; border-bottom:1px solid #f1f5f9;">
              👤 <strong>${a.nombre}</strong> (${a.dni}) ➔ Adjudicado en <strong>[${a.puestoId}] ${a.puestoReal.tipo}</strong> (${a.ordenPreferencia}ª opción)
            </div>
          `).join('');
        }
      }
    }

    renderizarFilasRanking();
  } catch (err) {
    console.error('Error cargando ranking:', err);
    tbody.innerHTML = `<tr><td colspan="12" class="text-center empty-state text-danger">Error al cargar la clasificación: ${err.message}</td></tr>`;
  }
}

// Filtrar la tabla de ranking por estado
function filtrarTablaRanking(filtro) {
  filtroRankingActivo = filtro;

  // Actualizar botones de pestaña
  const btns = [
    { id: 'btnFiltroRankingTodos', key: 'todos' },
    { id: 'btnFiltroRankingAdjudicados', key: 'adjudicados' },
    { id: 'btnFiltroRankingResultas1', key: 'resultas1' },
    { id: 'btnFiltroRankingResultas2', key: 'resultas2' },
    { id: 'btnFiltroRankingReserva', key: 'reserva' },
    { id: 'btnFiltroRankingNoAptos', key: 'no_aptos' }
  ];

  btns.forEach(b => {
    const el = document.getElementById(b.id);
    if (el) {
      if (b.key === filtro) {
        el.className = 'btn btn-sm btn-primary';
      } else {
        el.className = 'btn btn-sm btn-outline';
      }
    }
  });

  renderizarFilasRanking();
}

function renderizarFilasRanking() {
  const tbody = document.getElementById('tbodyRanking');
  if (!tbody || !datosRankingActual) return;

  if (datosRankingActual.ranking.length === 0) {
    tbody.innerHTML = `<tr><td colspan="12" class="text-center empty-state" style="padding:2rem;">
      <div style="font-size:1.05rem; font-weight:600; color:#334155; margin-bottom:4px;">No hay aspirantes registrados para este puesto específico: <em>"[${datosRankingActual.puesto.codigoRpt || datosRankingActual.puesto.id}] ${datosRankingActual.puesto.tipo} - ${datosRankingActual.puesto.servicio || ''} (${datosRankingActual.puesto.localizacion || ''})"</em></div>
      <p class="help-text">Ve a "1. Baremación Individual", marca este puesto y pulsa "Guardar Aspirante", o pulsa arriba en "👥 Simular con Muestras" para cargar aspirantes de prueba.</p>
    </td></tr>`;
    return;
  }

  const isEsp = datosRankingActual.puesto.formaProvision === 'Concurso específico';

  // Filtrado según la pestaña activa
  let filas = datosRankingActual.ranking;
  if (filtroRankingActivo === 'adjudicados') {
    filas = filas.filter(r => r.estadoAdjudicacion === 'ADJUDICADO');
  } else if (filtroRankingActivo === 'resultas1') {
    filas = filas.filter(r => r.estadoAdjudicacion === 'ADJUDICADO 1ª RESULTAS' || r.estadoAdjudicacion === '1ª RESULTAS' || r.estadoAdjudicacion === '1ª/2ª RESULTAS');
  } else if (filtroRankingActivo === 'resultas2') {
    filas = filas.filter(r => r.estadoAdjudicacion === 'ADJUDICADO 2ª RESULTAS' || r.estadoAdjudicacion === '2ª RESULTAS' || r.estadoAdjudicacion === '1ª/2ª RESULTAS');
  } else if (filtroRankingActivo === 'reserva') {
    filas = filas.filter(r => r.estadoAdjudicacion === 'RESERVA' || r.estadoAdjudicacion === 'PERMANENCIA DESTINO');
  } else if (filtroRankingActivo === 'no_aptos') {
    filas = filas.filter(r => r.estadoAdjudicacion === 'NO ALCANZA MÍNIMO');
  }

  tbody.innerHTML = '';

  if (filas.length === 0) {
    let msgVacio = 'No hay aspirantes en este filtro.';
    if (filtroRankingActivo === 'reserva') {
      msgVacio = 'Actualmente no hay aspirantes en la Lista de Reserva ordinaria para este puesto.';
    } else if (filtroRankingActivo === 'resultas1') {
      msgVacio = 'No hay adjudicaciones de 1ª Resultas para este puesto.';
    } else if (filtroRankingActivo === 'resultas2') {
      msgVacio = 'No hay adjudicaciones de 2ª Resultas para este puesto.';
    } else if (filtroRankingActivo === 'adjudicados') {
      msgVacio = 'Ningún aspirante ha resultado adjudicatario en la fase inicial de este puesto.';
    }
    tbody.innerHTML = `<tr><td colspan="12" class="text-center empty-state" style="padding:1.75rem; color:#64748b;">${msgVacio}</td></tr>`;
    return;
  }

  filas.forEach(cand => {
    const tr = document.createElement('tr');

    let badgeHtml = '';
    if (cand.estadoAdjudicacion === 'ADJUDICADO') {
      tr.style.backgroundColor = '#f0fdf4';
      badgeHtml = `<span class="badge-adjudicado">✓ ADJUDICADO (Fase Inicial)</span>`;
    } else if (cand.estadoAdjudicacion === 'ADJUDICADO 1ª RESULTAS') {
      tr.style.backgroundColor = '#ecfdf5';
      badgeHtml = `<span class="badge-adjudicado" style="background:#059669; color:#ffffff;">🔄 ADJUDICADO (1ª Resultas)</span>`;
    } else if (cand.estadoAdjudicacion === 'ADJUDICADO 2ª RESULTAS') {
      tr.style.backgroundColor = '#eef2ff';
      badgeHtml = `<span class="badge-adjudicado" style="background:#4338ca; color:#ffffff;">🔁 ADJUDICADO (2ª Resultas)</span>`;
    } else if (cand.estadoAdjudicacion === 'PERMANENCIA DESTINO') {
      tr.style.backgroundColor = '#f8fafc';
      badgeHtml = `
        <span class="badge badge-neutral" style="border:1px solid #cbd5e1; font-weight:700;">🏠 PERMANENCIA DESTINO ACTUAL</span>
        <div style="font-size:0.72rem; color:#64748b; margin-top:2px;">(Mantiene puesto definitivo actual, Base Novena)</div>
      `;
    } else if (cand.estadoAdjudicacion === 'RESERVA') {
      tr.style.backgroundColor = '#fffbeb';
      badgeHtml = `
        <span class="badge-reserva">📋 RESERVA Nº ${cand.ordenReserva || 1}</span>
        ${cand.detalleEstado ? `<div style="font-size:0.72rem; color:#475569; margin-top:2px; font-weight:500;">${cand.detalleEstado}</div>` : ''}
      `;
    } else if (cand.estadoAdjudicacion.includes('RESULTAS')) {
      tr.style.backgroundColor = '#eff6ff';
      badgeHtml = `
        <span class="badge-resultas">🔄 ${cand.estadoAdjudicacion}</span>
        ${cand.detalleEstado ? `<div style="font-size:0.72rem; color:#1e40af; margin-top:2px; font-weight:500;">${cand.detalleEstado}</div>` : ''}
      `;
    } else {
      badgeHtml = `<span class="badge-no-apto">✕ NO ALCANZA MÍNIMO</span>`;
    }

    const orderClass = cand.orden <= 3 && cand.estadoAdjudicacion.startsWith('ADJUDICADO') ? 'order-badge top-place' : 'order-badge';

    tr.innerHTML = `
      <td class="text-center"><span class="${orderClass}">${cand.orden}º</span></td>
      <td><strong>${cand.dni}</strong></td>
      <td><strong>${cand.nombre}</strong></td>
      <td><span class="badge badge-info" style="font-size:0.75rem; font-weight:700;">${cand.ordenPreferencia ? cand.ordenPreferencia + 'ª opción' : '1ª opción'}</span></td>
      <td><strong style="font-size:1.05rem; color:#1e40af;">${cand.puntuacionFinal.toFixed(4)}</strong></td>
      <td>${badgeHtml}</td>
      <td>${(isEsp ? cand.desempate.fase2 : cand.desempate.meritosEspecificos).toFixed(4)}</td>
      <td>${cand.desempate.grado.toFixed(2)}</td>
      <td>${cand.desempate.trabajo.toFixed(4)}</td>
      <td>${cand.desempate.cursos.toFixed(4)}</td>
      <td>${cand.desempate.antiguedad.toFixed(4)}</td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="cargarAspiranteParaEditar('${cand.id}')" title="Cargar y editar">Editar</button>
        <button class="btn-icon-danger" onclick="eliminarAspiranteConcurso('${cand.id}')" title="Eliminar">&times;</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Desplegar/ocultar cuadro global de 1ª Resultas
function togglePanelBolsaResultas() {
  const panel = document.getElementById('panelBolsaResultas');
  if (!panel) return;
  panel.style.display = (panel.style.display === 'none' || !panel.style.display) ? 'block' : 'none';
}

// Cargar aspirante existente para edición
async function cargarAspiranteParaEditar(id) {
  try {
    const res = await fetch('/api/aspirantes');
    const lista = await res.json();
    const asp = lista.find(a => a.id === id);
    if (!asp) return;

    document.getElementById('inputNombre').value = asp.nombre || '';
    document.getElementById('inputDNI').value = asp.dni || '';
    
    // Restaurar puestos solicitados múltiples
    if (asp.puestosSolicitados && Array.isArray(asp.puestosSolicitados) && asp.puestosSolicitados.length > 0) {
      puestosSolicitados = JSON.parse(JSON.stringify(asp.puestosSolicitados));
    } else if (asp.puestoSolicitado) {
      puestosSolicitados = [{ ...asp.puestoSolicitado, orden: 1 }];
    } else {
      puestosSolicitados = [{ ...catalogoPuestos[0], orden: 1 }];
    }

    // Seleccionar el primer puesto de la lista para previsualizar
    if (puestosSolicitados.length > 0) {
      const idx = catalogoPuestos.findIndex(p => esMismoPuesto(p, puestosSolicitados[0]));
      if (idx >= 0) {
        document.getElementById('selectPuesto').value = idx;
        seleccionarPuesto(idx);
      }
    }

    cambiarVistaPuestos('solicitados');
    renderizarListaOrdenablePuestos();
    renderizarChecklistPuestos();
    renderizarPillsPuestos();

    const selSit = document.getElementById('selectSituacionAdmin');
    const chkRes = document.getElementById('chkParticipaResultas');
    const chkSolo = document.getElementById('chkSoloResultas');
    const chkRen = document.getElementById('chkRenunciaResultas');
    const helpProv = document.getElementById('helpResultasProvisional');
    const sitAdmin = asp.situacionAdministrativa || 'definitiva';
    if (selSit) selSit.value = sitAdmin;
    const inpOrig = document.getElementById('inputPuestoOrigen');
    if (inpOrig) inpOrig.value = asp.puestoOrigen || '';

    if (chkSolo) chkSolo.checked = !!asp.soloResultas;
    if (chkRen) chkRen.checked = !!asp.renunciaResultas;

    if (chkRes) {
      if (sitAdmin === 'provisional') {
        chkRes.checked = true;
        chkRes.disabled = true;
        if (chkRen) { chkRen.checked = false; chkRen.disabled = true; }
        if (helpProv) helpProv.style.display = 'block';
      } else {
        chkRes.checked = asp.participaResultas !== undefined ? !!asp.participaResultas : true;
        chkRes.disabled = false;
        if (chkRen) chkRen.disabled = false;
        if (helpProv) helpProv.style.display = 'none';
      }
    }

    document.getElementById('selectGrado').value = asp.gradoPersonal || '16';
    document.getElementById('chkConcilHijos').checked = !!asp.conciliacionHijos;
    document.getElementById('chkConcilConyuge').checked = !!asp.conciliacionConyuge;
    document.getElementById('inputAntigVinculada').value = asp.antiguedadVinculadaDias || 0;
    document.getElementById('inputAntigOtras').value = asp.antiguedadOtrasDias || 0;

    meritoActual = asp.merits || { cursos: [], experiencia: [], titulaciones: [], idiomas: [], archivosProcesados: [] };

    document.getElementById('navBtnIndividual').click();
    actualizarVistas();
    recalcular();
    mostrarToast('Aspirante Cargado', `Cargada la ficha de "${asp.nombre}" con ${puestosSolicitados.length} puesto(s).`);
  } catch (err) {
    alert('Error al cargar datos del aspirante: ' + err.message);
  }
}

async function eliminarAspiranteConcurso(id) {
  if (!confirm('¿Seguro que deseas eliminar este aspirante del concurso?')) return;
  try {
    await fetch(`/api/aspirantes/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await actualizarContadorAspirantes();
    await cargarCuadroAdjudicacion();
    mostrarToast('Aspirante Eliminado', 'Se ha eliminado del cuadro del concurso.');
  } catch (err) {
    alert('Error al eliminar: ' + err.message);
  }
}

// Descargar Acta Oficial en Excel
async function exportarRankingExcel() {
  if (!datosRankingActual || !datosRankingActual.ranking || datosRankingActual.ranking.length === 0) {
    alert('No hay datos en el ranking para exportar.');
    return;
  }

  try {
    const res = await fetch('/api/export-ranking-excel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rankingData: datosRankingActual })
    });

    if (!res.ok) throw new Error('Error al generar el acta');

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cod = datosRankingActual.puesto.codigoRpt || datosRankingActual.puesto.id || 'Puesto';
    const tipo = (datosRankingActual.puesto.tipo || 'Puesto').replace(/\s+/g, '_');
    a.download = `Acta_Adjudicacion_${cod}_${tipo}_Cabildo.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (err) {
    alert('Error al exportar acta de adjudicación: ' + err.message);
  }
}

// Descargar Excel individual
async function descargarExcelIndividual() {
  if (!ultimoCalculo || !puestoSeleccionado) {
    alert('Primero debes realizar la baremación');
    return;
  }

  const candidateData = {
    nombre: document.getElementById('inputNombre').value || 'Aspirante',
    dni: document.getElementById('inputDNI').value || 'Sin DNI',
    puestoSolicitado: puestoSeleccionado,
    gradoPersonal: document.getElementById('selectGrado').value,
    conciliacionHijos: document.getElementById('chkConcilHijos').checked,
    conciliacionConyuge: document.getElementById('chkConcilConyuge').checked,
    antiguedadVinculadaDias: parseInt(document.getElementById('inputAntigVinculada').value, 10) || 0,
    antiguedadOtrasDias: parseInt(document.getElementById('inputAntigOtras').value, 10) || 0,
    titulaciones: meritoActual.titulaciones,
    idiomas: meritoActual.idiomas
  };

  try {
    const res = await fetch('/api/export-excel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidateData,
        calculationResult: ultimoCalculo
      })
    });

    if (!res.ok) throw new Error('Error al generar el archivo');

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Baremacion_${(candidateData.dni || 'Auxiliar').replace(/\s+/g, '_')}_Cabildo.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (err) {
    alert('Error al descargar el Excel: ' + err.message);
  }
}

// Modales para Cursos
function abrirModalNuevoCurso() {
  document.getElementById('mCursoIdx').value = '-1';
  document.getElementById('modalCursoTitulo').textContent = 'Añadir Curso de Formación';
  document.getElementById('mCursoTitulo').value = '';
  document.getElementById('mCursoHoras').value = '20';
  document.getElementById('mCursoTipo').value = 'Aprovechamiento';
  document.getElementById('mCursoCaracter').value = 'Específico';
  document.getElementById('modalCurso').style.display = 'flex';
}

function abrirModalEditarCurso(idx) {
  const c = meritoActual.cursos[idx];
  if (!c) return;

  document.getElementById('mCursoIdx').value = idx;
  document.getElementById('modalCursoTitulo').textContent = 'Editar Curso de Formación';
  document.getElementById('mCursoTitulo').value = c.titulo || '';
  document.getElementById('mCursoHoras').value = c.horas || 10;
  document.getElementById('mCursoTipo').value = c.tipo || 'Aprovechamiento';
  document.getElementById('mCursoCaracter').value = c.caracter || 'Específico';
  document.getElementById('modalCurso').style.display = 'flex';
}

function guardarCursoModal() {
  const idx = parseInt(document.getElementById('mCursoIdx').value, 10);
  const titulo = document.getElementById('mCursoTitulo').value.trim() || 'Curso sin título';
  const horas = parseFloat(document.getElementById('mCursoHoras').value) || 10;
  const tipo = document.getElementById('mCursoTipo').value;
  const caracter = document.getElementById('mCursoCaracter').value;

  const datosCurso = {
    titulo,
    horas,
    tipo,
    caracter,
    esEspecifico: (caracter === 'Específico'),
    incluido: idx >= 0 && meritoActual.cursos[idx] && meritoActual.cursos[idx].incluido !== undefined ? meritoActual.cursos[idx].incluido : true,
    origenArchivo: idx >= 0 && meritoActual.cursos[idx] ? meritoActual.cursos[idx].origenArchivo : 'Añadido manualmente'
  };

  if (idx >= 0 && meritoActual.cursos[idx]) {
    // Editar existente
    meritoActual.cursos[idx] = { ...meritoActual.cursos[idx], ...datosCurso };
    mostrarToast('Curso Actualizado', `"${titulo}" actualizado con ${horas} horas.`);
  } else {
    // Añadir nuevo
    meritoActual.cursos.push(datosCurso);
    mostrarToast('Curso Añadido', `"${titulo}" incorporado (${horas} h).`);
  }

  cerrarModales();
  actualizarVistas();
  recalcular();
}

// Modales para Experiencia
function abrirModalNuevaExp() {
  document.getElementById('mExpIdx').value = '-1';
  document.getElementById('modalExpTitulo').textContent = 'Añadir Período de Servicios Prestados';
  document.getElementById('mExpPuesto').value = 'Auxiliar Administrativo/a';
  document.getElementById('mExpAdmin').value = 'Cabildo Insular de Tenerife';
  document.getElementById('mExpCD').value = '16';
  document.getElementById('mExpDias').value = '365';
  document.getElementById('mExpTipoPlaza').value = 'vinculada';
  document.getElementById('mExpEspecifica').checked = false;
  document.getElementById('modalExp').style.display = 'flex';
}

function abrirModalEditarExp(idx) {
  const e = meritoActual.experiencia[idx];
  if (!e) return;

  document.getElementById('mExpIdx').value = idx;
  document.getElementById('modalExpTitulo').textContent = 'Editar Período de Servicios Prestados';
  document.getElementById('mExpPuesto').value = e.puesto || 'Auxiliar Administrativo/a';
  document.getElementById('mExpAdmin').value = e.administracion || 'Cabildo Insular de Tenerife';
  document.getElementById('mExpCD').value = e.cd || 16;
  document.getElementById('mExpDias').value = e.dias || 365;
  document.getElementById('mExpTipoPlaza').value = e.tipoPlaza || 'vinculada';
  document.getElementById('mExpEspecifica').checked = !!e.esEspecificaAmbito;
  document.getElementById('modalExp').style.display = 'flex';
}

function guardarExpModal() {
  const idx = parseInt(document.getElementById('mExpIdx').value, 10);
  const puesto = document.getElementById('mExpPuesto').value.trim() || 'Auxiliar Administrativo/a';
  const administracion = document.getElementById('mExpAdmin').value.trim() || 'Cabildo Insular de Tenerife';
  const cd = parseInt(document.getElementById('mExpCD').value, 10) || 16;
  const dias = parseInt(document.getElementById('mExpDias').value, 10) || 365;
  const esEspecificaAmbito = document.getElementById('mExpEspecifica').checked;
  const tipoPlaza = document.getElementById('mExpTipoPlaza').value || 'vinculada';

  const datosExp = {
    puesto,
    administracion,
    cd,
    dias,
    esEspecificaAmbito,
    tipoPlaza,
    origenArchivo: idx >= 0 && meritoActual.experiencia[idx] ? meritoActual.experiencia[idx].origenArchivo : 'Añadido manualmente'
  };

  if (idx >= 0 && meritoActual.experiencia[idx]) {
    meritoActual.experiencia[idx] = { ...meritoActual.experiencia[idx], ...datosExp };
    mostrarToast('Período Actualizado', `${puesto} (${dias} días) actualizado.`);
  } else {
    meritoActual.experiencia.push(datosExp);
    mostrarToast('Período Añadido', `${puesto} (${dias} días) añadido.`);
  }

  cerrarModales();
  sincronizarAntiguedadAutomatica();
  actualizarVistas();
  recalcular();
}

function agregarTitulacionPrompt() {
  const tipo = prompt('Selecciona el tipo de titulación oficial:\n1 - Grado / Licenciatura / Diplomatura\n2 - Ciclo Formativo Grado Superior (CFGS)\n3 - Ciclo Formativo Grado Medio (CFGM)', '1');
  if (!tipo) return;

  let tipoNombre = 'Grado / Licenciatura / Diplomatura';
  if (tipo === '2') tipoNombre = 'Ciclo Formativo Grado Superior (CFGS)';
  else if (tipo === '3') tipoNombre = 'Ciclo Formativo Grado Medio (CFGM)';

  const denominacion = prompt('Escribe el nombre de la titulación:', 'Grado universitario oficial');
  if (denominacion) {
    meritoActual.titulaciones.push({ tipo: tipoNombre, denominacion, origenArchivo: 'Manual' });
    actualizarVistas();
    recalcular();
    mostrarToast('Titulación Añadida', `${tipoNombre}: ${denominacion}`);
  }
}

function agregarIdiomaPrompt() {
  const idioma = prompt('Idioma oficial (Inglés, Francés o Alemán):', 'Inglés');
  if (!idioma) return;
  const nivel = prompt('Nivel acreditado según MCER (A1, A2, B1, B2, C1, C2):', 'B2');
  if (nivel) {
    meritoActual.idiomas.push({ idioma: idioma.toUpperCase(), nivel: nivel.toUpperCase(), origenArchivo: 'Manual' });
    actualizarVistas();
    recalcular();
    mostrarToast('Idioma Añadido', `${idioma.toUpperCase()} nivel ${nivel.toUpperCase()}`);
  }
}

function cerrarModales() {
  const mCurso = document.getElementById('modalCurso');
  const mExp = document.getElementById('modalExp');
  const mTexto = document.getElementById('modalTexto');
  const mPuesto = document.getElementById('modalNuevoPuesto');
  if (mCurso) mCurso.style.display = 'none';
  if (mExp) mExp.style.display = 'none';
  if (mTexto) mTexto.style.display = 'none';
  if (mPuesto) mPuesto.style.display = 'none';
}

function abrirModalNuevoPuesto(plazaPrevia = null) {
  const modal = document.getElementById('modalNuevoPuesto');
  if (!modal) return;
  
  if (plazaPrevia) {
    document.getElementById('mPuestoCodigo').value = plazaPrevia.codigoRpt || '';
    document.getElementById('mPuestoTipo').value = plazaPrevia.tipo || 'Auxiliar Administrativo/a';
    document.getElementById('mPuestoServicio').value = plazaPrevia.servicio || '';
    document.getElementById('mPuestoUnidad').value = plazaPrevia.unidad || '';
    document.getElementById('mPuestoCD').value = plazaPrevia.cd || 16;
    document.getElementById('mPuestoCE').value = plazaPrevia.ce || 28;
    document.getElementById('mPuestoFaseOferta').value = (plazaPrevia.faseLiberacion === '2ª Resultas' || plazaPrevia.faseLiberacion === '2a_resultas') ? '2a_resultas' : '1a_resultas';
    document.getElementById('mPuestoLiberadoPor').value = plazaPrevia.liberadoPor ? `${plazaPrevia.liberadoPor} (${plazaPrevia.dniLiberador || ''})` : '';
  } else {
    document.getElementById('mPuestoCodigo').value = '';
    document.getElementById('mPuestoTipo').value = 'Auxiliar Administrativo/a';
    document.getElementById('mPuestoServicio').value = '';
    document.getElementById('mPuestoUnidad').value = '';
    document.getElementById('mPuestoCD').value = 16;
    document.getElementById('mPuestoCE').value = 28;
    document.getElementById('mPuestoFaseOferta').value = '1a_resultas';
    document.getElementById('mPuestoLiberadoPor').value = '';
  }
  
  modal.style.display = 'flex';
}

async function guardarNuevoPuestoModal() {
  const codigo = document.getElementById('mPuestoCodigo').value.trim();
  const tipo = document.getElementById('mPuestoTipo').value.trim();
  const servicio = document.getElementById('mPuestoServicio').value.trim();
  const unidad = document.getElementById('mPuestoUnidad').value.trim();
  const localizacion = document.getElementById('mPuestoLocalizacion').value.trim();
  const formaProvision = document.getElementById('mPuestoForma').value;
  const cd = parseInt(document.getElementById('mPuestoCD').value, 10) || 16;
  const ce = parseInt(document.getElementById('mPuestoCE').value, 10) || 28;
  const faseOferta = document.getElementById('mPuestoFaseOferta').value;
  const liberadoPor = document.getElementById('mPuestoLiberadoPor').value.trim();

  if (!codigo || !tipo || !servicio) {
    alert('Por favor, completa al menos el Código RPT, Denominación/Tipo y Servicio.');
    return;
  }

  const nuevoPuesto = {
    id: codigo,
    codigoRpt: codigo,
    tipo,
    servicio,
    unidad: unidad || undefined,
    localizacion: localizacion || 'Zona metropolitana Santa Cruz de Tenerife- La Laguna',
    formaProvision,
    cd,
    ce,
    faseOferta,
    liberadoPor: liberadoPor || undefined,
    entidad: 'Cabildo'
  };

  try {
    const res = await fetch('/api/puestos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nuevoPuesto)
    });
    const data = await res.json();
    if (data.success) {
      mostrarToast('Puesto Ofertado', `Se ha incorporado ${codigo} (${tipo}) a la oferta (${faseOferta}).`);
      cerrarModales();
      await cargarPuestos();
      const vistaAdj = document.getElementById('vistaAdjudicacion');
      if (vistaAdj && vistaAdj.classList.contains('active')) {
        await cargarCuadroAdjudicacion();
      }
    } else {
      alert('Error al guardar puesto: ' + (data.error || 'Desconocido'));
    }
  } catch (err) {
    alert('Error al comunicar con el servidor: ' + err.message);
  }
}

async function incorporarPlazaLiberada(plazaJsonEncoded) {
  try {
    const plaza = JSON.parse(decodeURIComponent(plazaJsonEncoded));
    const res = await fetch('/api/puestos/incorporar-liberado', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plazaLiberada: plaza })
    });
    const data = await res.json();
    if (data.success) {
      mostrarToast('Plaza Ofertada', `Puesto ${plaza.codigoRpt} añadido al catálogo oficial para resultas.`);
      await cargarPuestos();
      await cargarCuadroAdjudicacion();
    } else {
      alert('Error: ' + (data.error || 'No se pudo incorporar la plaza'));
    }
  } catch (err) {
    alert('Error al ofertar plaza liberada: ' + err.message);
  }
}

// Cerrar modales al pulsar la tecla Escape o al hacer clic fuera del contenido
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    cerrarModales();
  }
});

document.addEventListener('click', (e) => {
  if (e.target && e.target.classList && e.target.classList.contains('modal')) {
    cerrarModales();
  }
});

// Notificación Toast Flotante
function mostrarToast(titulo, desc) {
  const toast = document.getElementById('toastNotification');
  if (!toast) return;

  document.getElementById('toastTitle').textContent = titulo;
  document.getElementById('toastDesc').textContent = desc;

  toast.style.display = 'block';

  if (window.toastTimeout) clearTimeout(window.toastTimeout);
  window.toastTimeout = setTimeout(() => {
    toast.style.display = 'none';
  }, 4000);
}

// Ver texto extraído de un archivo analizado
function verTextoExtraido(index) {
  const item = meritoActual.archivosProcesados[index];
  if (!item) return;

  document.getElementById('modalTextoTitulo').textContent = `Texto Extraído: ${item.archivo}`;
  document.getElementById('preTextoExtraido').textContent = item.textoExtraidoPreview || 'Sin texto extraído disponible';
  document.getElementById('modalTexto').style.display = 'flex';
}

// Escanear una carpeta local desde la ruta en disco
async function escanearCarpetaRuta(folderPath) {
  const statusEl = document.getElementById('uploadStatus');
  statusEl.style.display = 'flex';
  const textEl = document.getElementById('uploadStatusText');
  if (textEl) textEl.textContent = `Escaneando carpeta: ${folderPath}...`;

  try {
    const res = await fetch('/api/scan-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al escanear carpeta');

    if (data.resultados && data.resultados.length > 0) {
      let totalCursosNuevos = 0;
      let totalExpNuevos = 0;

      data.resultados.forEach(resArchivo => {
        if (!resArchivo.success) return;

        if (resArchivo.datosCandidato.nombre && !document.getElementById('inputNombre').value) {
          document.getElementById('inputNombre').value = resArchivo.datosCandidato.nombre;
        }
        if (resArchivo.datosCandidato.dni && !document.getElementById('inputDNI').value) {
          document.getElementById('inputDNI').value = resArchivo.datosCandidato.dni;
        }
        if (resArchivo.gradoDetectado) {
          const selectGrado = document.getElementById('selectGrado');
          if (selectGrado) selectGrado.value = resArchivo.gradoDetectado.toString();
        }
        if (resArchivo.cursos && resArchivo.cursos.length > 0) {
          totalCursosNuevos += resArchivo.cursos.length;
          meritoActual.cursos.push(...resArchivo.cursos);
        }
        if (resArchivo.experiencia && resArchivo.experiencia.length > 0) {
          totalExpNuevos += resArchivo.experiencia.length;
          resArchivo.experiencia.forEach(e => {
            if (!e.tipoPlaza) e.tipoPlaza = 'vinculada';
          });
          meritoActual.experiencia.push(...resArchivo.experiencia);
        }
        if (resArchivo.titulaciones && resArchivo.titulaciones.length > 0) {
          meritoActual.titulaciones.push(...resArchivo.titulaciones);
        }
        if (resArchivo.idiomas && resArchivo.idiomas.length > 0) {
          meritoActual.idiomas.push(...resArchivo.idiomas);
        }
        meritoActual.archivosProcesados.push(resArchivo);
      });

      sincronizarAntiguedadAutomatica();
      actualizarVistas();
      await recalcular();
      mostrarToast('Carpeta Procesada', `Analizados ${data.resultados.length} archivo(s): +${totalCursosNuevos} cursos, +${totalExpNuevos} servicios.`);
    } else {
      alert(data.mensaje || 'No se encontraron archivos PDF o Word en la carpeta especificada.');
    }
  } catch (err) {
    alert('Error al escanear la carpeta: ' + err.message);
  } finally {
    statusEl.style.display = 'none';
  }
}

