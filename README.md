# Aplicación de Baremación - Concurso de Auxiliares Administrativos
### Excmo. Cabildo Insular de Tenerife & IASS
Bases publicadas en el Boletín Oficial de la Provincia (BOP) nº 114 del 23 de septiembre de 2026.

---

## 🚀 Cómo Iniciar la Aplicación

1. **Opción Directa (Recomendada):**
   - Ve a la carpeta del proyecto:
     `C:\Users\Educacion\.gemini\antigravity\scratch\concurso-auxiliares`
   - Haz **doble clic en el archivo `Iniciar_Aplicacion.bat`**.
   - Se abrirá automáticamente la aplicación en tu navegador en `http://localhost:3000`.

2. **Opción desde la consola:**
   ```bash
   cd C:\Users\Educacion\.gemini\antigravity\scratch\concurso-auxiliares
   node server.js
   ```

---

## 📋 Funcionalidades Principales

1. **Datos del Aspirante y Puesto:**
   - Selección dinámica del puesto solicitado (Auxiliar Administrativo/a, Auxiliar Adscrito/a, Jefe/a de Negociado, Gestor/a de Servicios, etc.).
   - Reconocimiento automático de si se trata de **Concurso Ordinario** (10 puntos) o **Concurso Específico** (dos fases: Fase 1 [7 ptos, mín. 2.50] y Fase 2 [3 ptos, mín. 1.50]).
   - Nivel de complemento de destino (CD) y requisitos mínimos de experiencia.
   - Selección de Grado personal consolidado, Antigüedad (días en plaza vinculada y en otras plazas) y Conciliación familiar (cuidado de hijos menores de 12 o cónyuge en distinto municipio).

2. **Procesamiento de Documentos (PDF y Word `.docx`):**
   - Zona de arrastrar y soltar múltiples archivos simultáneamente.
   - Extracción de texto y detección automática de:
     - Diplomas de cursos (horas lectivas, equivalencia de créditos, modalidad de asistencia vs. aprovechamiento o impartición).
     - Clasificación sugerida según las materias del Anexo I (Específicos de las funciones vs. Generales corporativos).
     - Certificados de servicios prestados y vidas laborales (cálculo de días trabajados y nivel CD).
     - Títulos universitarios (Grado, Licenciado, Diplomado), CFGS y CFGM.
     - Certificados de idiomas oficiales (A1 a C2).
     - Grado personal reconocido y DNI/Nombre del candidato.

3. **Revisión y Ajuste Interactivo:**
   - Tablas interactivas con cálculo de puntos por cada mérito.
   - Posibilidad de alternar el tipo de curso (asistencia o aprovechamiento) o el carácter (específico o general) con un clic.
   - Posibilidad de añadir o editar méritos manualmente.

4. **Baremación Oficial y Exportación a Excel (.xlsx):**
   - Cálculo en tiempo real con 4 decimales según las fórmulas exactas de la Base Séptima.
   - Generación de un libro de Excel oficial con:
     - **Hoja 1 (Resumen_Baremacion):** Ficha oficial con datos del aspirante, desglose por apartados o fases, topes, mínimos exigidos y resultado de aptitud.
     - **Hoja 2 (Detalle_Cursos):** Lista completa de cursos aportados con sus horas, modalidad, carácter, factor aplicado y puntos brutos.
     - **Hoja 3 (Detalle_Experiencia):** Desglose de servicios prestados, administraciones, nivel CD y días computados.
     - **Hoja 4 (Otros_Meritos):** Titulaciones académicas, idiomas, grado personal y conciliación familiar.
