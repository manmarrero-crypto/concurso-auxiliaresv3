/**
 * Servicio de Adjudicación y Clasificación Oficial
 * Aplica los criterios de prelación y las reglas de desempate de la Base Novena,
 * el principio de orden de preferencia del concursante,
 * y el procedimiento oficial de FASE INICIAL y 1ª FASE DE RESULTAS.
 */
const { calculateScore } = require('./calculator');

function compareDesempate(a, b, isEspecifico) {
  // 1. Puntuación Final
  if (Math.abs(b.puntuacionFinal - a.puntuacionFinal) > 0.00001) {
    return b.puntuacionFinal - a.puntuacionFinal;
  }

  // Si hay empate, aplicar orden riguroso de la Base Novena:
  // 1º.- Méritos específicos
  const espA = isEspecifico ? (a.desempate.fase2 || 0) : (a.desempate.meritosEspecificos || 0);
  const espB = isEspecifico ? (b.desempate.fase2 || 0) : (b.desempate.meritosEspecificos || 0);
  if (Math.abs(espB - espA) > 0.00001) {
    return espB - espA;
  }

  // 2º.- Grado Personal Reconocido
  const gradoA = a.desempate.grado || 0;
  const gradoB = b.desempate.grado || 0;
  if (Math.abs(gradoB - gradoA) > 0.00001) {
    return gradoB - gradoA;
  }

  // 3º.- Trabajo Desarrollado
  const trabA = a.desempate.trabajo || 0;
  const trabB = b.desempate.trabajo || 0;
  if (Math.abs(trabB - trabA) > 0.00001) {
    return trabB - trabA;
  }

  // 4º.- Cursos de Formación
  const cursA = a.desempate.cursos || 0;
  const cursB = b.desempate.cursos || 0;
  if (Math.abs(cursB - cursA) > 0.00001) {
    return cursB - cursA;
  }

  // 5º.- Antigüedad
  const antigA = a.desempate.antiguedad || 0;
  const antigB = b.desempate.antiguedad || 0;
  if (Math.abs(antigB - antigA) > 0.00001) {
    return antigB - antigA;
  }

  // Criterio subsidiario: Prioridad por orden de preferencia de la opción solicitada
  if (a.ordenPreferencia && b.ordenPreferencia && a.ordenPreferencia !== b.ordenPreferencia) {
    return a.ordenPreferencia - b.ordenPreferencia;
  }

  return 0;
}

function matchesPuesto(solicitado, puesto) {
  if (!solicitado || !puesto) return false;
  // 1. Coincidencia por id o código RPT exacto
  if (solicitado.id && (solicitado.id === puesto.id || solicitado.id === puesto.codigoRpt)) return true;
  if (solicitado.codigoRpt && (solicitado.codigoRpt === puesto.codigoRpt || solicitado.codigoRpt === puesto.id)) return true;
  
  // 2. Si el puesto es único oficial (donde solo hay 1 en toda la convocatoria)
  if (puesto.esPuestoUnico && solicitado.tipo === puesto.tipo) return true;

  // 3. Si ambos no tienen código RPT o coinciden exactamente por tipo y no hay colisión
  if (!solicitado.codigoRpt && !puesto.codigoRpt && solicitado.tipo === puesto.tipo) return true;

  return false;
}

/**
 * Resuelve la adjudicación oficial de la convocatoria en sus dos fases reglamentarias:
 * 
 * FASE 1 (Adjudicación Inicial):
 * - Cada concursante solicita puestos ordenados (1ª preferencia, 2ª, ... N-ésima).
 * - Se le adjudica el puesto en el que alcance plaza por puntuación y sea su opción más preferente.
 * - Si gana un aspirante con puesto definitivo, libera su puesto de origen (generando una resulta).
 * 
 * FASE 2 (1ª Resultas):
 * - Los concursantes sin plaza en fase inicial pasan a 1ª Resultas si:
 *   a) Su situación es PROVISIONAL (obligatorio por bases).
 *   b) Su situación es DEFINITIVA y marcó en su solicitud la opción de ir a Resultas.
 * - Los definitivos que no marcaron resultas permanecen en su destino y no van a resultas.
 */
function resolverConcursoGlobal(puestosCatalogo, aspirantes) {
  const evaluaciones = [];

  aspirantes.forEach(asp => {
    const listaSol = (Array.isArray(asp.puestosSolicitados) && asp.puestosSolicitados.length > 0)
      ? asp.puestosSolicitados
      : (asp.puestoSolicitado ? [asp.puestoSolicitado] : []);

    listaSol.forEach((sol, idx) => {
      const pReal = puestosCatalogo.find(p => matchesPuesto(sol, p));
      if (!pReal) return;

      const ordenPref = sol.orden || (idx + 1);
      const isEsp = pReal.formaProvision === 'Concurso específico';
      const calc = calculateScore({ ...asp, puestoSolicitado: pReal }, asp.merits || {});

      let desempate = {};
      if (isEsp) {
        desempate = {
          fase2: calc.fases ? calc.fases.fase2.puntos : 0,
          grado: calc.fases ? calc.fases.fase1.apartados.gradoPersonal.puntos : 0,
          trabajo: calc.fases ? calc.fases.fase1.apartados.trabajoDesarrollado.puntos : 0,
          cursos: calc.fases ? calc.fases.fase1.apartados.cursosFormacion.puntos : 0,
          antiguedad: calc.fases ? calc.fases.fase1.apartados.antiguedad.puntos : 0
        };
      } else {
        desempate = {
          meritosEspecificos: calc.apartados ? calc.apartados.meritosEspecificos.puntos : 0,
          grado: calc.apartados ? calc.apartados.gradoPersonal.puntos : 0,
          trabajo: calc.apartados ? calc.apartados.trabajoDesarrollado.puntos : 0,
          cursos: calc.apartados ? calc.apartados.cursosFormacion.puntos : 0,
          antiguedad: calc.apartados ? calc.apartados.antiguedad.puntos : 0
        };
      }

      evaluaciones.push({
        aspId: asp.id,
        nombre: asp.nombre,
        dni: asp.dni,
        puestoId: pReal.id || pReal.codigoRpt,
        puestoReal: pReal,
        ordenPreferencia: ordenPref,
        puntuacionFinal: calc.puntuacionFinal,
        superaMinimo: calc.superaMinimo,
        minimoExigido: calc.minimoExigido,
        desempate,
        calcDetalle: calc
      });
    });
  });

  // ==========================================
  // FASE 1: ADJUDICACIÓN INICIAL
  // ==========================================
  const propuestasAspirante = new Map();
  const adjudicacionesFase1 = new Map(); // puestoId -> Array de candidatos adjudicados
  const opcionesPorAspirante = new Map();

  aspirantes.forEach(asp => {
    const misOpciones = evaluaciones
      .filter(e => e.aspId === asp.id && e.superaMinimo)
      .sort((a, b) => a.ordenPreferencia - b.ordenPreferencia);
    opcionesPorAspirante.set(asp.id, misOpciones);
    propuestasAspirante.set(asp.id, 0);
  });

  puestosCatalogo.forEach(p => {
    adjudicacionesFase1.set(p.id || p.codigoRpt, []);
  });

  const aspirantesSinAsignar = aspirantes.map(a => a.id);

  while (aspirantesSinAsignar.length > 0) {
    const aspId = aspirantesSinAsignar.shift();
    const misOpciones = opcionesPorAspirante.get(aspId) || [];
    const idxPropuesta = propuestasAspirante.get(aspId) || 0;

    if (idxPropuesta >= misOpciones.length) {
      continue; // No alcanza plaza en sus opciones solicitadas en Fase Inicial
    }

    const opcionActual = misOpciones[idxPropuesta];
    propuestasAspirante.set(aspId, idxPropuesta + 1);

    const pId = opcionActual.puestoId;
    const pReal = opcionActual.puestoReal;
    const dotaciones = pReal.dotaciones || 1;
    const isEsp = pReal.formaProvision === 'Concurso específico';

    const actuales = adjudicacionesFase1.get(pId) || [];

    if (actuales.length < dotaciones) {
      actuales.push(opcionActual);
      adjudicacionesFase1.set(pId, actuales);
    } else {
      const candidatos = [...actuales, opcionActual];
      candidatos.sort((a, b) => compareDesempate(a, b, isEsp));

      const aceptados = candidatos.slice(0, dotaciones);
      const rechazados = candidatos.slice(dotaciones);

      adjudicacionesFase1.set(pId, aceptados);

      rechazados.forEach(rechazado => {
        if (!aspirantesSinAsignar.includes(rechazado.aspId)) {
          aspirantesSinAsignar.push(rechazado.aspId);
        }
      });
    }
  }

  // Mapa de adjudicados en Fase 1
  const adjudicadoAspirante = new Map(); // aspId -> { puestoId, ordenPreferencia, fase: 'inicial' }
  adjudicacionesFase1.forEach((lista, pId) => {
    lista.forEach(cand => {
      adjudicadoAspirante.set(cand.aspId, {
        puestoId: pId,
        ordenPreferencia: cand.ordenPreferencia,
        puestoReal: cand.puestoReal,
        fase: 'inicial'
      });
    });
  });

  // =========================================================================
  // DETECCIÓN DE RESULTAS: FASE 2 (1ª RESULTAS) Y FASE 3 (2ª RESULTAS)
  // Conforme a Base Primera (máximo dos resultas) y Base Novena
  // =========================================================================

  // Helper para normalizar información de plaza liberada por un funcionario definitivo
  function extraerPlazaLiberada(asp, puestoGanado, fase) {
    const origStr = (asp.puestoOrigen || '').trim();
    // Intentar extraer código RPT si viene en formato "FC1843 - ..." o similar
    const matchCod = origStr.match(/([A-Z]{2,4}\d{2,5})/i);
    const codigoRpt = matchCod ? matchCod[1].toUpperCase() : (origStr || `ORIGEN-${asp.dni}`);
    const puestoCat = puestosCatalogo.find(p => p.codigoRpt === codigoRpt || p.id === codigoRpt);

    return {
      id: codigoRpt,
      codigoRpt: codigoRpt,
      tipo: puestoCat ? puestoCat.tipo : (asp.puestoOrigenTipo || 'Auxiliar Administrativo/a'),
      servicio: puestoCat ? puestoCat.servicio : (asp.puestoOrigenServicio || origStr || 'Servicio de procedencia'),
      localizacion: puestoCat ? puestoCat.localizacion : (asp.puestoOrigenLoc || 'Santa Cruz de Tenerife'),
      formaProvision: puestoCat ? puestoCat.formaProvision : 'Concurso ordinario',
      cd: puestoCat ? puestoCat.cd : (asp.puestoOrigenCd || 16),
      dotaciones: 1,
      liberadoPor: asp.nombre,
      dniLiberador: asp.dni,
      nuevoPuestoAdjudicado: puestoGanado.puestoId,
      tipoPuestoNuevo: puestoGanado.puestoReal.tipo,
      faseLiberacion: fase,
      estaEnCatalogo: !!puestoCat,
      descripcion: puestoCat ? puestoCat.descripcion : `${codigoRpt} (Liberado por ${asp.nombre})`
    };
  }

  // 1. Plazas liberadas en FASE 1 por definitivos que ganaron plaza titular inicial
  const plazasLiberadas1aResultas = [];
  aspirantes.forEach(asp => {
    const adj = adjudicadoAspirante.get(asp.id);
    if (adj) {
      const esDefinitivo = (asp.situacionAdministrativa || 'definitiva').toLowerCase() === 'definitiva';
      if (esDefinitivo) {
        plazasLiberadas1aResultas.push(extraerPlazaLiberada(asp, adj, '1ª Resultas'));
      }
    }
  });

  // 2. Determinar aspirantes con derecho a concurrir a 1ª RESULTAS
  // Base Primera (líneas 59-62): Quienes participaron en la primera fase y los que solicitaron solo resultas
  const aspirantesEn1aResultas = [];
  const aspirantesPermanenciaDestino = [];

  aspirantes.forEach(asp => {
    const adj = adjudicadoAspirante.get(asp.id);
    if (!adj) {
      const esProvisional = (asp.situacionAdministrativa || '').toLowerCase() === 'provisional';
      const renunciaExpresa = !!asp.renunciaResultas;

      if (esProvisional) {
        aspirantesEn1aResultas.push({
          ...asp,
          motivoResultas: 'Obligatorio (Adscripción Provisional)'
        });
      } else if (!renunciaExpresa) {
        aspirantesEn1aResultas.push({
          ...asp,
          motivoResultas: asp.soloResultas ? 'Participa Únicamente a Resultas (Bases)' : 'Concursante con derecho a Resultas por solicitud (Bases)'
        });
      } else {
        aspirantesPermanenciaDestino.push({
          ...asp,
          motivo: 'Titular Definitivo (Renuncia expresa a Resultas - Permanece en destino actual)'
        });
      }
    }
  });

  // 3. Ejecución de ADJUDICACIÓN DE 1ª RESULTAS
  // Puestos disponibles en 1ª Resultas: Plazas liberadas en Fase 1 + vacantes iniciales no cubiertas
  const adjudicaciones1aResultas = [];
  const setCodigos1aResultas = new Set(plazasLiberadas1aResultas.map(p => p.codigoRpt.toUpperCase()));

  // Ordenar aspirantes de 1ª Resultas por mayor puntuación y prelación
  aspirantesEn1aResultas.forEach(asp => {
    const misOpciones = evaluaciones
      .filter(e => e.aspId === asp.id && e.superaMinimo)
      .sort((a, b) => a.ordenPreferencia - b.ordenPreferencia);

    for (const opc of misOpciones) {
      const pCod = (opc.puestoId || '').toUpperCase();
      const esPlazaLiberada = setCodigos1aResultas.has(pCod) || plazasLiberadas1aResultas.some(pl => pl.codigoRpt.includes(pCod));
      const ocupadosFase1 = (adjudicacionesFase1.get(opc.puestoId) || []).length;
      const vacantesLibres = (opc.puestoReal.dotaciones || 1) - ocupadosFase1;
      const yaAdjudicadoEn1aResultas = adjudicaciones1aResultas.filter(a => a.puestoId === opc.puestoId).length;

      if (esPlazaLiberada || (vacantesLibres - yaAdjudicadoEn1aResultas > 0)) {
        adjudicadoAspirante.set(asp.id, {
          puestoId: opc.puestoId,
          ordenPreferencia: opc.ordenPreferencia,
          puestoReal: opc.puestoReal,
          fase: '1a_resultas'
        });
        adjudicaciones1aResultas.push({
          aspId: asp.id,
          nombre: asp.nombre,
          dni: asp.dni,
          puestoId: opc.puestoId,
          puestoReal: opc.puestoReal,
          ordenPreferencia: opc.ordenPreferencia,
          motivo: asp.motivoResultas
        });
        break;
      }
    }
  });

  // 4. Plazas liberadas para FASE 3 (2ª RESULTAS)
  // Generadas por funcionarios definitivos que ganaron plaza en 1ª Resultas
  const plazasLiberadas2aResultas = [];
  adjudicaciones1aResultas.forEach(adj1 => {
    const asp = aspirantes.find(a => a.id === adj1.aspId);
    if (asp) {
      const esDefinitivo = (asp.situacionAdministrativa || 'definitiva').toLowerCase() === 'definitiva';
      if (esDefinitivo) {
        plazasLiberadas2aResultas.push(extraerPlazaLiberada(asp, adj1, '2ª Resultas'));
      }
    }
  });

  // 5. Aspirantes que concurren a 2ª RESULTAS
  // Aquellos que siguen sin plaza tras la 1ª Resultas
  const aspirantesEn2aResultas = [];
  aspirantesEn1aResultas.forEach(asp => {
    const adj = adjudicadoAspirante.get(asp.id);
    if (!adj) {
      aspirantesEn2aResultas.push({
        ...asp,
        motivoResultas: asp.motivoResultas + ' -> Pasa a 2ª Resultas'
      });
    }
  });

  // 6. Ejecución de ADJUDICACIÓN DE 2ª RESULTAS
  const adjudicaciones2aResultas = [];
  const setCodigos2aResultas = new Set(plazasLiberadas2aResultas.map(p => p.codigoRpt.toUpperCase()));

  aspirantesEn2aResultas.forEach(asp => {
    const misOpciones = evaluaciones
      .filter(e => e.aspId === asp.id && e.superaMinimo)
      .sort((a, b) => a.ordenPreferencia - b.ordenPreferencia);

    for (const opc of misOpciones) {
      const pCod = (opc.puestoId || '').toUpperCase();
      const esPlazaLiberada2 = setCodigos2aResultas.has(pCod) || plazasLiberadas2aResultas.some(pl => pl.codigoRpt.includes(pCod));
      const ocupadosFase1 = (adjudicacionesFase1.get(opc.puestoId) || []).length;
      const ocupados1aRes = adjudicaciones1aResultas.filter(a => a.puestoId === opc.puestoId).length;
      const vacantesLibres = (opc.puestoReal.dotaciones || 1) - ocupadosFase1 - ocupados1aRes;
      const yaAdjudicadoEn2aResultas = adjudicaciones2aResultas.filter(a => a.puestoId === opc.puestoId).length;

      if (esPlazaLiberada2 || (vacantesLibres - yaAdjudicadoEn2aResultas > 0)) {
        adjudicadoAspirante.set(asp.id, {
          puestoId: opc.puestoId,
          ordenPreferencia: opc.ordenPreferencia,
          puestoReal: opc.puestoReal,
          fase: '2a_resultas'
        });
        adjudicaciones2aResultas.push({
          aspId: asp.id,
          nombre: asp.nombre,
          dni: asp.dni,
          puestoId: opc.puestoId,
          puestoReal: opc.puestoReal,
          ordenPreferencia: opc.ordenPreferencia,
          motivo: asp.motivoResultas
        });
        break;
      }
    }
  });

  // Consolidar aspirantes que quedan definitivamente sin plaza tras 2ª Resultas
  aspirantesEn2aResultas.forEach(asp => {
    const adj = adjudicadoAspirante.get(asp.id);
    if (!adj) {
      const esDefinitivo = (asp.situacionAdministrativa || 'definitiva').toLowerCase() === 'definitiva';
      if (esDefinitivo) {
        aspirantesPermanenciaDestino.push({
          ...asp,
          motivo: 'Titular Definitivo sin plaza en Fase Ordinaria ni en 1ª/2ª Resultas (Mantiene adjudicación definitiva actual, Base Novena)'
        });
      }
    }
  });

  return {
    evaluaciones,
    adjudicacionesFase1,
    adjudicadoAspirante,
    plazasLiberadas1aResultas,
    aspirantesEn1aResultas,
    adjudicaciones1aResultas,
    plazasLiberadas2aResultas,
    aspirantesEn2aResultas,
    adjudicaciones2aResultas,
    aspirantesPermanenciaDestino
  };
}

/**
 * Calcula la propuesta de clasificación y adjudicación para un puesto concreto
 */
function computeRankingForPuesto(puesto, aspirantes, todosLosPuestos = null) {
  const catalogo = todosLosPuestos && todosLosPuestos.length > 0 ? todosLosPuestos : [puesto];
  const resolucion = resolverConcursoGlobal(catalogo, aspirantes);

  const pId = puesto.id || puesto.codigoRpt;
  const isEsp = puesto.formaProvision === 'Concurso específico';
  const dotaciones = puesto.dotaciones || 1;

  // Candidatos que solicitaron este puesto concreto
  const candidatosPuesto = resolucion.evaluaciones.filter(e => e.puestoId === pId);

  // Separar aptos de no aptos
  const aptos = candidatosPuesto.filter(c => c.superaMinimo);
  const noAptos = candidatosPuesto.filter(c => !c.superaMinimo);

  // Ordenar según criterios estrictos de la Base Novena
  aptos.sort((a, b) => compareDesempate(a, b, isEsp));
  noAptos.sort((a, b) => compareDesempate(a, b, isEsp));

  const ranking = [];
  let ordenNum = 1;
  let ordenReservaNum = 1;

  aptos.forEach((cand) => {
    const asignacion = resolucion.adjudicadoAspirante.get(cand.aspId);
    const esAdjudicadoEnEstePuesto = asignacion && asignacion.puestoId === pId;
    const esAdjudicadoEnOtroPuesto = asignacion && asignacion.puestoId !== pId;

    let estado = 'RESERVA';
    let detalleEstado = '';

    if (esAdjudicadoEnEstePuesto) {
      if (asignacion.fase === '2a_resultas') {
        estado = 'ADJUDICADO 2ª RESULTAS';
        detalleEstado = `Adjudicado en 2ª Resultas (${cand.ordenPreferencia}ª opción)`;
      } else if (asignacion.fase === '1a_resultas') {
        estado = 'ADJUDICADO 1ª RESULTAS';
        detalleEstado = `Adjudicado en 1ª Resultas (${cand.ordenPreferencia}ª opción)`;
      } else {
        estado = 'ADJUDICADO';
        detalleEstado = `Adjudicado en Fase Inicial (${cand.ordenPreferencia}ª opción)`;
      }
    } else if (esAdjudicadoEnOtroPuesto) {
      estado = 'RESERVA';
      const faseTxt = asignacion.fase === 'inicial' ? 'Fase Inicial' : (asignacion.fase === '1a_resultas' ? '1ª Resultas' : '2ª Resultas');
      detalleEstado = `En reserva (Adjudicado en opción ${asignacion.ordenPreferencia}ª: ${asignacion.puestoId} [${faseTxt}])`;
    } else {
      // No tiene plaza asignada en ninguna fase
      const aspData = aspirantes.find(a => a.id === cand.aspId);
      const esProv = aspData && (aspData.situacionAdministrativa || '').toLowerCase() === 'provisional';
      const renuncia = aspData && !!aspData.renunciaResultas;

      if (renuncia) {
        estado = 'PERMANENCIA DESTINO';
        detalleEstado = 'Mantiene destino definitivo actual (Renuncia expresa a resultas, Base Novena)';
      } else if (esProv) {
        estado = '1ª/2ª RESULTAS';
        detalleEstado = 'En bolsa de Resultas (Adscripción provisional obligada)';
      } else {
        estado = 'RESERVA';
        detalleEstado = `Lista de Reserva Nº ${ordenReservaNum} (Amparado a Resultas por solicitud)`;
      }
    }

    ranking.push({
      orden: ordenNum++,
      id: cand.aspId,
      nombre: cand.nombre || 'Sin nombre',
      dni: cand.dni || 'Sin DNI',
      ordenPreferencia: cand.ordenPreferencia,
      puntuacionFinal: cand.puntuacionFinal,
      superaMinimo: cand.superaMinimo,
      minimoExigido: cand.minimoExigido,
      desempate: cand.desempate,
      calcDetalle: cand.calcDetalle,
      estadoAdjudicacion: estado,
      detalleEstado: detalleEstado,
      puestoAdjudicado: esAdjudicadoEnEstePuesto ? puesto.tipo : (asignacion ? asignacion.puestoReal.tipo : null),
      ordenReserva: (estado === 'RESERVA' || estado === '1ª RESULTAS' || estado === '1ª/2ª RESULTAS') ? ordenReservaNum++ : null
    });
  });

  noAptos.forEach(cand => {
    ranking.push({
      orden: ordenNum++,
      id: cand.aspId,
      nombre: cand.nombre || 'Sin nombre',
      dni: cand.dni || 'Sin DNI',
      ordenPreferencia: cand.ordenPreferencia,
      puntuacionFinal: cand.puntuacionFinal,
      superaMinimo: cand.superaMinimo,
      minimoExigido: cand.minimoExigido,
      desempate: cand.desempate,
      calcDetalle: cand.calcDetalle,
      estadoAdjudicacion: 'NO ALCANZA MÍNIMO',
      detalleEstado: 'Puntuación insuficiente (No supera corte)',
      puestoAdjudicado: null,
      ordenReserva: null
    });
  });

  const adjudicadosCount = ranking.filter(r => r.estadoAdjudicacion.startsWith('ADJUDICADO')).length;
  const reservasCount = ranking.filter(r => r.estadoAdjudicacion === 'RESERVA').length;
  const resultasCount = ranking.filter(r => r.estadoAdjudicacion.includes('RESULTAS')).length;

  return {
    puesto,
    dotaciones,
    vacantesRestantes: Math.max(0, dotaciones - adjudicadosCount),
    totalAspirantes: ranking.length,
    totalAdjudicados: adjudicadosCount,
    totalReservas: reservasCount,
    totalResultas: resultasCount,
    ranking,
    cuadroResultasGlobal: {
      plazasLiberadas1aResultas: resolucion.plazasLiberadas1aResultas,
      aspirantesEn1aResultas: resolucion.aspirantesEn1aResultas,
      adjudicaciones1aResultas: resolucion.adjudicaciones1aResultas,
      plazasLiberadas2aResultas: resolucion.plazasLiberadas2aResultas,
      aspirantesEn2aResultas: resolucion.aspirantesEn2aResultas,
      adjudicaciones2aResultas: resolucion.adjudicaciones2aResultas,
      aspirantesPermanenciaDestino: resolucion.aspirantesPermanenciaDestino,
      // Retrocompatibilidad
      plazasLiberadas: [...resolucion.plazasLiberadas1aResultas, ...resolucion.plazasLiberadas2aResultas],
      aspirantesEnResultas: resolucion.aspirantesEn1aResultas,
      adjudicacionesResultas: [...resolucion.adjudicaciones1aResultas, ...resolucion.adjudicaciones2aResultas]
    }
  };
}

/**
 * Calcula el cuadro de mando y estadísticas globales:
 * - Auditoría de todas las valoraciones registradas con fecha, puestos pedidos y puntuación
 * - Ranking de puestos más demandados con su adjudicatario actual y los dos primeros de reserva
 */
function computeGlobalStatistics(aspirantes, puestos) {
  const resolucion = resolverConcursoGlobal(puestos, aspirantes);

  // 1. Resumen por aspirante
  let totalPeticiones = 0;
  const aspirantesResumen = aspirantes.map(asp => {
    const asignacion = resolucion.adjudicadoAspirante.get(asp.id);
    const puestosPedidos = (asp.puestosSolicitados && Array.isArray(asp.puestosSolicitados) && asp.puestosSolicitados.length > 0)
      ? asp.puestosSolicitados
      : (asp.puestoSolicitado ? [{ ...asp.puestoSolicitado, orden: 1 }] : []);

    totalPeticiones += puestosPedidos.length;

    // Encontrar evaluaciones de este aspirante
    const misEvals = resolucion.evaluaciones.filter(e => e.aspId === asp.id);
    const mejorPunt = misEvals.length > 0 ? Math.max(...misEvals.map(e => e.puntuacionFinal)) : (asp.resultadoCalculo?.total || 0);

    return {
      id: asp.id,
      dni: asp.dni,
      nombre: asp.nombre,
      createdAt: asp.createdAt || asp.updatedAt || new Date().toISOString(),
      updatedAt: asp.updatedAt || new Date().toISOString(),
      situacionAdministrativa: asp.situacionAdministrativa || 'definitiva',
      puestoOrigen: asp.puestoOrigen || '',
      puestosSolicitados: puestosPedidos,
      totalPuestosPedidos: puestosPedidos.length,
      puntuacionMax: mejorPunt,
      evaluaciones: misEvals.map(e => ({
        puestoId: e.puestoId,
        codigoRpt: e.puestoReal?.codigoRpt || e.puestoId,
        ordenPreferencia: e.ordenPreferencia,
        puntuacionFinal: e.puntuacionFinal,
        superaMinimo: e.superaMinimo
      })),
      adjudicacion: asignacion ? {
        puestoId: asignacion.puestoId,
        codigoRpt: asignacion.puestoReal?.codigoRpt || asignacion.puestoId,
        tipo: asignacion.puestoReal?.tipo || 'Auxiliar Administrativo/a',
        servicio: asignacion.puestoReal?.servicio || '',
        ordenPreferencia: asignacion.ordenPreferencia,
        fase: asignacion.fase
      } : null
    };
  });

  // 2. Ranking de puestos por demanda (número de solicitudes)
  const puestosDemanda = puestos.map(p => {
    const pId = p.id || p.codigoRpt;
    const isEsp = p.formaProvision === 'Concurso específico';
    const dotaciones = p.dotaciones || 1;

    // Candidatos que pidieron este puesto
    const candidatosQuePidieron = resolucion.evaluaciones.filter(e => e.puestoId === pId);
    const aptos = candidatosQuePidieron.filter(c => c.superaMinimo);
    aptos.sort((a, b) => compareDesempate(a, b, isEsp));

    // Determinar adjudicatario(s) y reservas
    const adjudicados = [];
    const reservas = [];

    aptos.forEach(cand => {
      const asignacion = resolucion.adjudicadoAspirante.get(cand.aspId);
      if (asignacion && asignacion.puestoId === pId) {
        adjudicados.push({
          aspId: cand.aspId,
          dni: cand.dni,
          nombre: cand.nombre,
          puntuacionFinal: cand.puntuacionFinal,
          ordenPreferencia: cand.ordenPreferencia,
          fase: asignacion.fase
        });
      } else if (!asignacion) {
        reservas.push({
          aspId: cand.aspId,
          dni: cand.dni,
          nombre: cand.nombre,
          puntuacionFinal: cand.puntuacionFinal,
          ordenPreferencia: cand.ordenPreferencia
        });
      }
    });

    const adjudicatario = adjudicados[0] || null;
    const reserva1 = reservas[0] || null;
    const reserva2 = reservas[1] || null;

    return {
      puesto: p,
      id: pId,
      codigoRpt: p.codigoRpt || p.id,
      tipo: p.tipo,
      cd: p.cd || 16,
      servicio: p.servicio || '',
      localizacion: p.localizacion || 'S/C',
      dotaciones,
      totalSolicitudes: candidatosQuePidieron.length,
      adjudicatario,
      adjudicados,
      reserva1,
      reserva2,
      totalReservas: reservas.length,
      candidatos: candidatosQuePidieron.map(c => ({
        aspId: c.aspId,
        dni: c.dni,
        nombre: c.nombre,
        ordenPreferencia: c.ordenPreferencia,
        puntuacionFinal: c.puntuacionFinal,
        superaMinimo: c.superaMinimo,
        esAdjudicado: !!(adjudicatario && adjudicatario.aspId === c.aspId)
      }))
    };
  });

  // Ordenar por defecto por mayor número de solicitudes
  puestosDemanda.sort((a, b) => b.totalSolicitudes - a.totalSolicitudes || (a.codigoRpt || '').localeCompare(b.codigoRpt || '', undefined, { numeric: true }));

  const puestosCubiertos = puestosDemanda.filter(pd => pd.adjudicatario !== null).length;
  const aspirantesConPlaza = aspirantesResumen.filter(ar => ar.adjudicacion !== null).length;
  const aspirantesEnReserva = aspirantesResumen.filter(ar => ar.adjudicacion === null).length;

  return {
    aspirantes: aspirantesResumen,
    puestosDemanda,
    metricas: {
      totalAspirantes: aspirantes.length,
      totalPeticiones,
      totalPuestos: puestos.length,
      puestosCubiertos,
      aspirantesConPlaza,
      aspirantesEnReserva
    }
  };
}

module.exports = { computeRankingForPuesto, resolverConcursoGlobal, computeGlobalStatistics, matchesPuesto };
