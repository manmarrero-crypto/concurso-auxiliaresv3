const { calculateScore } = require('../services/calculator');

function compareDesempate(a, b, isEspecifico) {
  if (Math.abs(b.puntuacionFinal - a.puntuacionFinal) > 0.00001) {
    return b.puntuacionFinal - a.puntuacionFinal;
  }
  const espA = isEspecifico ? (a.desempate.fase2 || 0) : (a.desempate.meritosEspecificos || 0);
  const espB = isEspecifico ? (b.desempate.fase2 || 0) : (b.desempate.meritosEspecificos || 0);
  if (Math.abs(espB - espA) > 0.00001) return espB - espA;

  const gradoA = a.desempate.grado || 0;
  const gradoB = b.desempate.grado || 0;
  if (Math.abs(gradoB - gradoA) > 0.00001) return gradoB - gradoA;

  const trabA = a.desempate.trabajo || 0;
  const trabB = b.desempate.trabajo || 0;
  if (Math.abs(trabB - trabA) > 0.00001) return trabB - trabA;

  const cursA = a.desempate.cursos || 0;
  const cursB = b.desempate.cursos || 0;
  if (Math.abs(cursB - cursA) > 0.00001) return cursB - cursA;

  const antigA = a.desempate.antiguedad || 0;
  const antigB = b.desempate.antiguedad || 0;
  if (Math.abs(antigB - antigA) > 0.00001) return antigB - antigA;

  if (a.ordenPreferencia && b.ordenPreferencia && a.ordenPreferencia !== b.ordenPreferencia) {
    return a.ordenPreferencia - b.ordenPreferencia;
  }
  return 0;
}

function matchesPuesto(solicitado, puesto) {
  if (!solicitado || !puesto) return false;
  if (solicitado.id && (solicitado.id === puesto.id || solicitado.id === puesto.codigoRpt)) return true;
  if (solicitado.codigoRpt && (solicitado.codigoRpt === puesto.codigoRpt || solicitado.codigoRpt === puesto.id)) return true;
  if (puesto.esPuestoUnico && solicitado.tipo === puesto.tipo) return true;
  if (!solicitado.codigoRpt && !puesto.codigoRpt && solicitado.tipo === puesto.tipo) return true;
  return false;
}

// Algoritmo de Adjudicación Oficial de la Convocatoria
function resolverConcursoGlobal(puestos, aspirantes) {
  // 1. Precalcular la evaluación de cada aspirante para cada puesto solicitado
  const evaluaciones = []; // lista de { aspId, puestoId, ordenPreferencia, puntuacionFinal, superaMinimo, ... }

  aspirantes.forEach(asp => {
    const listaSol = (Array.isArray(asp.puestosSolicitados) && asp.puestosSolicitados.length > 0)
      ? asp.puestosSolicitados
      : (asp.puestoSolicitado ? [asp.puestoSolicitado] : []);

    listaSol.forEach((sol, idx) => {
      const pReal = puestos.find(p => matchesPuesto(sol, p));
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

  // 2. Gale-Shapley Deferred Acceptance (Prioridad del concursante por preferencia)
  // Estado de los aspirantes: qué opción están proponiendo (índice 0, 1, ...)
  const propuestasAspirante = new Map(); // aspId -> index en sus opciones ordenadas
  const adjudicacionesPuesto = new Map(); // puestoId -> Array de candidatos asignados
  const opcionesPorAspirante = new Map(); // aspId -> Array de opciones ordenadas por preferencia

  aspirantes.forEach(asp => {
    const misOpciones = evaluaciones
      .filter(e => e.aspId === asp.id && e.superaMinimo)
      .sort((a, b) => a.ordenPreferencia - b.ordenPreferencia);
    opcionesPorAspirante.set(asp.id, misOpciones);
    propuestasAspirante.set(asp.id, 0);
  });

  puestos.forEach(p => {
    adjudicacionesPuesto.set(p.id || p.codigoRpt, []);
  });

  let aspirantesSinAsignar = aspirantes.map(a => a.id);

  while (aspirantesSinAsignar.length > 0) {
    const aspId = aspirantesSinAsignar.shift();
    const misOpciones = opcionesPorAspirante.get(aspId) || [];
    const idxPropuesta = propuestasAspirante.get(aspId) || 0;

    if (idxPropuesta >= misOpciones.length) {
      // Ya agotó todas sus opciones válidas, no obtiene plaza
      continue;
    }

    const opcionActual = misOpciones[idxPropuesta];
    propuestasAspirante.set(aspId, idxPropuesta + 1); // siguiente para si es rechazado

    const pId = opcionActual.puestoId;
    const pReal = opcionActual.puestoReal;
    const dotaciones = pReal.dotaciones || 1;
    const isEsp = pReal.formaProvision === 'Concurso específico';

    const actuales = adjudicacionesPuesto.get(pId) || [];

    if (actuales.length < dotaciones) {
      actuales.push(opcionActual);
      adjudicacionesPuesto.set(pId, actuales);
    } else {
      // Puesto lleno: ordenar candidatos actuales junto con el nuevo candidato
      const candidatos = [...actuales, opcionActual];
      candidatos.sort((a, b) => compareDesempate(a, b, isEsp));

      const aceptados = candidatos.slice(0, dotaciones);
      const rechazados = candidatos.slice(dotaciones);

      adjudicacionesPuesto.set(pId, aceptados);

      // Los rechazados vuelven a la cola para proponer su siguiente opción
      rechazados.forEach(rechazado => {
        if (!aspirantesSinAsignar.includes(rechazado.aspId)) {
          aspirantesSinAsignar.push(rechazado.aspId);
        }
      });
    }
  }

  // Mapa final: aspId -> puestoAdjudicado
  const adjudicadoAspirante = new Map(); // aspId -> { puestoId, ordenPreferencia, puestoReal }
  adjudicacionesPuesto.forEach((lista, pId) => {
    lista.forEach(cand => {
      adjudicadoAspirante.set(cand.aspId, {
        puestoId: pId,
        ordenPreferencia: cand.ordenPreferencia,
        puestoReal: cand.puestoReal
      });
    });
  });

  return { evaluaciones, adjudicacionesPuesto, adjudicadoAspirante };
}

// Generar clasificación detallada para un puesto concreto
function obtenerClasificacionPuesto(puesto, aspirantes, puestosCatalogo) {
  const resolucion = resolverConcursoGlobal(puestosCatalogo, aspirantes);
  const pId = puesto.id || puesto.codigoRpt;
  const isEsp = puesto.formaProvision === 'Concurso específico';
  const dotaciones = puesto.dotaciones || 1;

  // Filtrar todas las evaluaciones de los aspirantes que solicitaron este puesto
  const candidatosPuesto = resolucion.evaluaciones.filter(e => e.puestoId === pId);

  // También incluir aspirantes que lo solicitaron pero no superaron el corte
  const aptos = candidatosPuesto.filter(c => c.superaMinimo);
  const noAptos = candidatosPuesto.filter(c => !c.superaMinimo);

  // Ordenar por méritos
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
      estado = 'ADJUDICADO';
      detalleEstado = 'Plaza Adjudicada';
    } else if (esAdjudicadoEnOtroPuesto) {
      estado = 'RESERVA';
      if (asignacion.ordenPreferencia < cand.ordenPreferencia) {
        detalleEstado = `Adjudicado en ${asignacion.ordenPreferencia}ª opción (${asignacion.puestoId})`;
      } else {
        detalleEstado = `Adjudicado en ${asignacion.puestoId}`;
      }
    } else {
      estado = 'RESERVA';
      detalleEstado = `Reserva Nº ${ordenReservaNum}`;
    }

    ranking.push({
      orden: ordenNum++,
      id: cand.aspId,
      nombre: cand.nombre,
      dni: cand.dni,
      ordenPreferencia: cand.ordenPreferencia,
      puntuacionFinal: cand.puntuacionFinal,
      superaMinimo: cand.superaMinimo,
      minimoExigido: cand.minimoExigido,
      desempate: cand.desempate,
      calcDetalle: cand.calcDetalle,
      estadoAdjudicacion: estado,
      detalleEstado: detalleEstado,
      puestoAdjudicado: esAdjudicadoEnEstePuesto ? puesto.tipo : (asignacion ? asignacion.puestoReal.tipo : null),
      ordenReserva: estado === 'RESERVA' ? ordenReservaNum++ : null
    });
  });

  noAptos.forEach(cand => {
    ranking.push({
      orden: ordenNum++,
      id: cand.aspId,
      nombre: cand.nombre,
      dni: cand.dni,
      ordenPreferencia: cand.ordenPreferencia,
      puntuacionFinal: cand.puntuacionFinal,
      superaMinimo: cand.superaMinimo,
      minimoExigido: cand.minimoExigido,
      desempate: cand.desempate,
      calcDetalle: cand.calcDetalle,
      estadoAdjudicacion: 'NO ALCANZA MÍNIMO',
      detalleEstado: 'Puntuación insuficiente',
      puestoAdjudicado: null,
      ordenReserva: null
    });
  });

  const adjudicadosCount = ranking.filter(r => r.estadoAdjudicacion === 'ADJUDICADO').length;
  const reservasCount = ranking.filter(r => r.estadoAdjudicacion === 'RESERVA').length;

  return {
    puesto,
    dotaciones,
    vacantesRestantes: Math.max(0, dotaciones - adjudicadosCount),
    totalAspirantes: ranking.length,
    totalAdjudicados: adjudicadosCount,
    totalReservas: reservasCount,
    ranking
  };
}

module.exports = { resolverConcursoGlobal, obtenerClasificacionPuesto };
