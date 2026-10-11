/**
 * Motor de Cálculo y Baremación oficial según la Base Séptima de la Convocatoria
 * Cabildo Insular de Tenerife / IASS - Plaza Auxiliar Administrativo/a
 */

function round4(val) {
  return Math.round((val + Number.EPSILON) * 10000) / 10000;
}

function calculateScore(candidateData, merits) {
  const { puestoSolicitado, gradoPersonal, conciliacionHijos, conciliacionConyuge } = candidateData;
  const isEspecifico = puestoSolicitado && puestoSolicitado.formaProvision === "Concurso específico";
  const puestoCD = puestoSolicitado ? puestoSolicitado.cd : 16;

  // 1. Grado personal reconocido (Tope 1.0 pto)
  let gradoScore = 0.40; // Mínimo
  const gradoNum = parseInt(gradoPersonal, 10);
  if (!isNaN(gradoNum)) {
    if (gradoNum >= 18) gradoScore = 1.00;
    else if (gradoNum === 17) gradoScore = 0.90;
    else if (gradoNum === 16) gradoScore = 0.80;
    else if (gradoNum === 15) gradoScore = 0.70;
    else if (gradoNum === 14) gradoScore = 0.60;
    else if (gradoNum === 13) gradoScore = 0.50;
    else gradoScore = 0.40;
  }

  // 2. Cursos de formación y perfeccionamiento
  // Distribuir entre específicos y generales/transversales
  let cursosEspAsistHoras = 0;
  let cursosEspAprovHoras = 0;
  let cursosGenAsistHoras = 0;
  let cursosGenAprovHoras = 0;

  const cursosDetalle = (merits.cursos || []).map(curso => {
    const incluido = curso.incluido !== false && curso.activo !== false;
    const horas = parseFloat(curso.horas) || 0;
    const esAprov = (curso.tipo || '').toLowerCase().includes('aprov') || (curso.tipo || '').toLowerCase().includes('impart');
    const esEsp = (curso.caracter || '').toLowerCase().includes('espec') || curso.esEspecifico;

    let factorPuntos = 0;
    if (isEspecifico) {
      if (esEsp) {
        factorPuntos = esAprov ? 0.0100 : 0.0075; // Fase 2
        if (incluido) {
          if (esAprov) cursosEspAprovHoras += horas; else cursosEspAsistHoras += horas;
        }
      } else {
        factorPuntos = esAprov ? 0.0067 : 0.0050; // Fase 1
        if (incluido) {
          if (esAprov) cursosGenAprovHoras += horas; else cursosGenAsistHoras += horas;
        }
      }
    } else {
      // Concurso Ordinario
      if (esEsp) {
        factorPuntos = esAprov ? 0.0200 : 0.0150; // Méritos específicos (Base Séptima 1.a)
        if (incluido) {
          if (esAprov) cursosEspAprovHoras += horas; else cursosEspAsistHoras += horas;
        }
      } else {
        factorPuntos = esAprov ? 0.0067 : 0.0050; // Cursos formación general (Base Séptima 1.d)
        if (incluido) {
          if (esAprov) cursosGenAprovHoras += horas; else cursosGenAsistHoras += horas;
        }
      }
    }

    const puntosBrutos = incluido ? round4(horas * factorPuntos) : 0;
    return {
      ...curso,
      horas,
      incluido,
      esAprovechamiento: esAprov,
      esEspecifico: esEsp,
      factorPuntos,
      puntosBrutos
    };
  });

  const resumenCursos = {
    especificos: {
      totalCursos: (merits.cursos || []).filter(c => ((c.caracter || '').toLowerCase().includes('espec') || c.esEspecifico)).length,
      cursosIncluidos: (merits.cursos || []).filter(c => ((c.caracter || '').toLowerCase().includes('espec') || c.esEspecifico) && c.incluido !== false && c.activo !== false).length,
      horasAsistencia: cursosEspAsistHoras,
      horasAprovechamiento: cursosEspAprovHoras,
      horasTotales: cursosEspAsistHoras + cursosEspAprovHoras,
      puntosBrutos: round4((cursosEspAsistHoras * (isEspecifico ? 0.0075 : 0.0150)) + (cursosEspAprovHoras * (isEspecifico ? 0.0100 : 0.0200)))
    },
    generales: {
      totalCursos: (merits.cursos || []).filter(c => !((c.caracter || '').toLowerCase().includes('espec') || c.esEspecifico)).length,
      cursosIncluidos: (merits.cursos || []).filter(c => !((c.caracter || '').toLowerCase().includes('espec') || c.esEspecifico) && c.incluido !== false && c.activo !== false).length,
      horasAsistencia: cursosGenAsistHoras,
      horasAprovechamiento: cursosGenAprovHoras,
      horasTotales: cursosGenAsistHoras + cursosGenAprovHoras,
      puntosBrutos: round4((cursosGenAsistHoras * 0.0050) + (cursosGenAprovHoras * 0.0067))
    }
  };

  // 3. Titulaciones académicas oficiales
  let titulacionesScoreRaw = 0;
  (merits.titulaciones || []).forEach(tit => {
    const tipo = (tit.tipo || '').toLowerCase();
    if (isEspecifico) {
      if (tipo.includes('grado') || tipo.includes('licenci') || tipo.includes('diplom')) titulacionesScoreRaw += 0.50;
      else if (tipo.includes('superior') || tipo.includes('cfgs')) titulacionesScoreRaw += 0.40;
      else if (tipo.includes('medio') || tipo.includes('cfgm')) titulacionesScoreRaw += 0.30;
    } else {
      if (tipo.includes('grado') || tipo.includes('licenci') || tipo.includes('diplom')) titulacionesScoreRaw += 1.00;
      else if (tipo.includes('superior') || tipo.includes('cfgs')) titulacionesScoreRaw += 0.80;
      else if (tipo.includes('medio') || tipo.includes('cfgm')) titulacionesScoreRaw += 0.60;
    }
  });

  // 4. Idiomas (Marco Europeo de Referencia)
  let idiomasScoreRaw = 0;
  (merits.idiomas || []).forEach(idioma => {
    const nivel = (idioma.nivel || '').toUpperCase();
    if (isEspecifico) {
      if (nivel === 'C2') idiomasScoreRaw += 0.75;
      else if (nivel === 'C1') idiomasScoreRaw += 0.625;
      else if (nivel === 'B2') idiomasScoreRaw += 0.50;
      else if (nivel === 'B1') idiomasScoreRaw += 0.375;
      else if (nivel === 'A2') idiomasScoreRaw += 0.25;
      else if (nivel === 'A1') idiomasScoreRaw += 0.125;
    } else {
      if (nivel === 'C2') idiomasScoreRaw += 1.50;
      else if (nivel === 'C1') idiomasScoreRaw += 1.25;
      else if (nivel === 'B2') idiomasScoreRaw += 1.00;
      else if (nivel === 'B1') idiomasScoreRaw += 0.75;
      else if (nivel === 'A2') idiomasScoreRaw += 0.50;
      else if (nivel === 'A1') idiomasScoreRaw += 0.25;
    }
  });

  // 5. Trabajo Desarrollado (Experiencia profesional)
  let trabajoDiasIgualOSup = 0;
  let trabajoDiasInf1o2 = 0;
  let trabajoDiasInf3o4 = 0;
  let trabajoDiasInf5oMas = 0;
  let experienciaEspecificaDias = 0;

  const experienciaDetalle = (merits.experiencia || []).map(exp => {
    const dias = parseInt(exp.dias, 10) || 0;
    const cd = parseInt(exp.cd, 10) || 16;
    const diff = puestoCD - cd;
    let factor = 0;

    if (exp.esEspecificaAmbito) {
      experienciaEspecificaDias += dias;
    }

    if (isEspecifico) {
      if (diff <= 0) { factor = 0.000547945; trabajoDiasIgualOSup += dias; }
      else if (diff <= 2) { factor = 0.000456621; trabajoDiasInf1o2 += dias; }
      else if (diff <= 4) { factor = 0.000391389; trabajoDiasInf3o4 += dias; }
      else { factor = 0.000342466; trabajoDiasInf5oMas += dias; }
    } else {
      if (diff <= 0) { factor = 0.000365297; trabajoDiasIgualOSup += dias; }
      else if (diff <= 2) { factor = 0.000304414; trabajoDiasInf1o2 += dias; }
      else if (diff <= 4) { factor = 0.000260926; trabajoDiasInf3o4 += dias; }
      else { factor = 0.000228311; trabajoDiasInf5oMas += dias; }
    }

    const puntosBrutos = round4(dias * factor);
    return {
      ...exp,
      dias,
      cd,
      factor,
      puntosBrutos
    };
  });

  // 6. Antigüedad
  let antiguedadVinculadaDias = parseInt(
    (merits && merits.antiguedadVinculadaDias !== undefined) ? merits.antiguedadVinculadaDias : candidateData.antiguedadVinculadaDias, 10
  ) || 0;
  let antiguedadOtrasDias = parseInt(
    (merits && merits.antiguedadOtrasDias !== undefined) ? merits.antiguedadOtrasDias : candidateData.antiguedadOtrasDias, 10
  ) || 0;

  const antigVinculadaAnios = Math.floor(antiguedadVinculadaDias / 365);
  const antigVinculadaDiasRestantes = antiguedadVinculadaDias % 365;
  const antigVinculadaScore = Math.min(1.0, (antigVinculadaAnios * 0.04) + (antigVinculadaDiasRestantes * 0.00011));

  const antigOtrasAnios = Math.floor(antiguedadOtrasDias / 365);
  const antigOtrasDiasRestantes = antiguedadOtrasDias % 365;
  const antigOtrasScore = Math.min(0.25, (antigOtrasAnios * 0.01) + (antigOtrasDiasRestantes * 0.000027397));

  const antiguedadTotalScore = round4(Math.min(1.0, antigVinculadaScore + antigOtrasScore));

  // 7. Conciliación de la vida personal y laboral (solo concurso ordinario)
  let conciliacionScore = 0;
  if (!isEspecifico) {
    if (conciliacionHijos) conciliacionScore += 0.5;
    if (conciliacionConyuge) conciliacionScore += 0.5;
    conciliacionScore = Math.min(1.0, conciliacionScore);
  }

  // BAREMACIÓN SEGÚN TIPO DE CONCURSO
  let resultado = {};

  if (!isEspecifico) {
    // CONCURSO ORDINARIO (Máx 10)
    // a) Méritos específicos (Tope 3.0)
    const puntosCursosEsp = (cursosEspAsistHoras * 0.0150) + (cursosEspAprovHoras * 0.0200);
    const puntosTitulacionesCap = Math.min(1.0, titulacionesScoreRaw);
    const meritosEspecificosTotal = round4(Math.min(3.0, puntosCursosEsp + puntosTitulacionesCap + idiomasScoreRaw));

    // b) Grado Personal (Tope 1.0)
    const gradoTotal = round4(Math.min(1.0, gradoScore));

    // c) Trabajo desarrollado (Tope 2.0)
    const trabajoRaw = (trabajoDiasIgualOSup * 0.000365297) +
                       (trabajoDiasInf1o2 * 0.000304414) +
                       (trabajoDiasInf3o4 * 0.000260926) +
                       (trabajoDiasInf5oMas * 0.000228311);
    const trabajoTotal = round4(Math.min(2.0, trabajoRaw));

    // d) Cursos de formación y perfeccionamiento (Tope 2.0)
    const cursosGenRaw = (cursosGenAsistHoras * 0.0050) + (cursosGenAprovHoras * 0.0067);
    const cursosGenTotal = round4(Math.min(2.0, cursosGenRaw));

    // e) Antigüedad (Tope 1.0)
    const antiguedadTotal = antiguedadTotalScore;

    // f) Conciliación (Tope 1.0)
    const conciliacionTotal = round4(conciliacionScore);

    const puntuacionFinal = round4(Math.min(10.0, meritosEspecificosTotal + gradoTotal + trabajoTotal + cursosGenTotal + antiguedadTotal + conciliacionTotal));
    const minimoExigido = puestoSolicitado ? puestoSolicitado.minimoSuperar : 1.5;
    const superaMinimo = puntuacionFinal >= minimoExigido;

    resultado = {
      tipoConcurso: "Concurso ordinario",
      puntuacionFinal,
      minimoExigido,
      superaMinimo,
      apartados: {
        meritosEspecificos: {
          titulo: "a) Méritos específicos",
          tope: 3.0,
          puntos: meritosEspecificosTotal,
          desglose: {
            cursosEspecificos: round4(puntosCursosEsp),
            titulaciones: round4(puntosTitulacionesCap),
            idiomas: round4(idiomasScoreRaw)
          }
        },
        gradoPersonal: {
          titulo: "b) Grado personal reconocido",
          tope: 1.0,
          puntos: gradoTotal,
          nivel: gradoPersonal
        },
        trabajoDesarrollado: {
          titulo: "c) Trabajo desarrollado",
          tope: 2.0,
          puntos: trabajoTotal,
          puntosBrutos: round4(trabajoRaw)
        },
        cursosFormacion: {
          titulo: "d) Cursos de formación y perfeccionamiento",
          tope: 2.0,
          puntos: cursosGenTotal,
          puntosBrutos: round4(cursosGenRaw)
        },
        antiguedad: {
          titulo: "e) Antigüedad",
          tope: 1.0,
          puntos: antiguedadTotal,
          desglose: {
            vinculada: round4(antigVinculadaScore),
            otras: round4(antigOtrasScore)
          }
        },
        conciliacion: {
          titulo: "f) Conciliación de la vida personal y laboral",
          tope: 1.0,
          puntos: conciliacionTotal,
          hijos: conciliacionHijos,
          conyuge: conciliacionConyuge
        }
      }
    };
  } else {
    // CONCURSO ESPECÍFICO (Máx 10, Dos Fases)
    // FASE 1 (Tope 7.0, Mínimo 2.50)
    const gradoTotal = round4(Math.min(1.0, gradoScore));
    const trabajoRaw = (trabajoDiasIgualOSup * 0.000547945) +
                       (trabajoDiasInf1o2 * 0.000456621) +
                       (trabajoDiasInf3o4 * 0.000391389) +
                       (trabajoDiasInf5oMas * 0.000342466);
    const trabajoTotal = round4(Math.min(3.0, trabajoRaw));
    const cursosGenRaw = (cursosGenAsistHoras * 0.0050) + (cursosGenAprovHoras * 0.0067);
    const cursosGenTotal = round4(Math.min(2.0, cursosGenRaw));
    const antiguedadTotal = antiguedadTotalScore;

    const fase1Total = round4(Math.min(7.0, gradoTotal + trabajoTotal + cursosGenTotal + antiguedadTotal));
    const superaFase1 = fase1Total >= 2.50;

    // FASE 2 (Tope 3.0, Mínimo 1.50)
    // Formación específica + titulaciones + idiomas (Tope 1.50)
    const cursosEspRaw = (cursosEspAsistHoras * 0.0075) + (cursosEspAprovHoras * 0.0100);
    const formacionEspTotal = round4(Math.min(1.50, cursosEspRaw + titulacionesScoreRaw + idiomasScoreRaw));

    // Experiencia específica (mínimo 6 meses / 180 días en ámbito del servicio) (Tope 1.50)
    let expEspPuntos = 0;
    if (experienciaEspecificaDias >= 180) {
      expEspPuntos = round4(Math.min(1.50, experienciaEspecificaDias * 0.000547945));
    }
    const expEspTotal = expEspPuntos;
    const fase2Total = round4(Math.min(3.0, formacionEspTotal + expEspTotal));
    const superaFase2 = fase2Total >= 1.50;

    const puntuacionFinal = round4(Math.min(10.0, fase1Total + fase2Total));
    const superaMinimo = superaFase1 && superaFase2 && (puntuacionFinal >= 4.00);

    resultado = {
      tipoConcurso: "Concurso específico",
      puntuacionFinal,
      minimoExigido: 4.00,
      superaFase1,
      superaFase2,
      superaMinimo,
      fases: {
        fase1: {
          titulo: "Primera Fase (Méritos Generales)",
          tope: 7.0,
          minimoRequerido: 2.50,
          puntos: fase1Total,
          superada: superaFase1,
          apartados: {
            gradoPersonal: { titulo: "b) Grado personal reconocido", tope: 1.0, puntos: gradoTotal },
            trabajoDesarrollado: { titulo: "c) Trabajo desarrollado", tope: 3.0, puntos: trabajoTotal, puntosBrutos: round4(trabajoRaw) },
            cursosFormacion: { titulo: "d) Cursos de formación y perfeccionamiento", tope: 2.0, puntos: cursosGenTotal, puntosBrutos: round4(cursosGenRaw) },
            antiguedad: { titulo: "e) Antigüedad", tope: 1.0, puntos: antiguedadTotal }
          }
        },
        fase2: {
          titulo: "Segunda Fase (Méritos Específicos del Puesto)",
          tope: 3.0,
          minimoRequerido: 1.50,
          puntos: fase2Total,
          superada: superaFase2,
          apartados: {
            formacionEspecifica: {
              titulo: "Formación específica, titulaciones e idiomas",
              tope: 1.50,
              puntos: formacionEspTotal,
              desglose: {
                cursos: round4(cursosEspRaw),
                titulaciones: round4(titulacionesScoreRaw),
                idiomas: round4(idiomasScoreRaw)
              }
            },
            experienciaEspecifica: {
              titulo: "Experiencia específica en el ámbito competencial (mín. 6 meses)",
              tope: 1.50,
              diasComputados: experienciaEspecificaDias,
              puntos: expEspTotal
            }
          }
        }
      }
    };
  }

  return {
    ...resultado,
    cursosDetalle,
    experienciaDetalle,
    resumenCursos
  };
}

module.exports = { calculateScore, round4 };
