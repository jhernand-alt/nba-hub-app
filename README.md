# NBA Hub 🏀

Aplicación web para seguimiento de ligas fantasy NBA y consulta de estadísticas históricas de jugadores.

Funciona directamente desde el navegador sin necesidad de servidor — basta con abrir `index.html` con doble clic.

🌐 **Demo:** [jhernand-alt.github.io/nba-hub-app](https://jhernand-alt.github.io/nba-hub-app/)

---

## Módulos

### 🏆 Liga Fantasy
Visualización de las estadísticas de tu liga fantasy ESPN a partir de CSVs generados por `0_diario_espn.py`:

- Tabla de jugadores con puntos totales, promedio, partidos jugados y rankings por período (semana, 2 semanas, mes, total)
- Indicador de tendencia por jugador (↑↑ ↑ -- ↓ ↓↓)
- Indicador de partido hoy y estado de lesión (OUT / DTD / Q)
- Filtros por equipo NBA, equipo fantasy y posición
- Buscador de texto
- Gráficos: top jugadores, por equipo fantasy, por equipo NBA, comparador de rankings

### 📈 Histórico NBA
Consulta del histórico de puntos fantasy de todos los jugadores NBA en temporadas anteriores. Carga `nba_fantasy_historico.csv` generado por los scripts Python:

- Selector de métrica: Puntos Totales / Partidos Jugados / Promedio
- Selector "Desde": filtra las temporadas visibles en la tabla
- Buscador de jugadores
- Gráfico de líneas comparando la evolución de los jugadores seleccionados

---

## Scripts de datos

Los scripts están en `csv/csv 26-27`. Ejecútalos desde esa carpeta porque leen y escriben archivos usando rutas relativas.

Instala las dependencias de Python una vez:

```bash
python -m pip install requests pandas nba_api
```

### Actualización diaria de la liga fantasy

Ejecuta `0_diario_espn.py` una vez al día, preferiblemente después de que terminen los partidos que quieras incluir:

```bash
cd "csv/csv 26-27"
python 0_diario_espn.py
```

Lee `JUGADOR ids.csv` y `ENTRENADOR ids.csv`. Genera tres CSV con fecha y hora: IDs actualizados de jugadores, estadísticas de jugadores y estadísticas de entrenadores. Copia esos archivos a la ubicación de datos que utiliza la aplicación.

### Actualización del histórico NBA

Para añadir o actualizar los totales de una temporada:

1. Ejecuta `1_hist_descargar.py` y escribe el año final de la temporada cuando lo solicite. Por ejemplo, `2027` descarga la temporada `2026-27`. Genera `nba_resumen_2026-27.csv`.
2. Ejecuta `2_hist_fusionar.py`. Combina los archivos `nba_resumen_*.csv` de la carpeta y reconstruye `nba_fantasy_historico.csv`.
3. Solo si necesitas sincronizar la lista de jugadores, ejecuta `3_hist_sincronizar_ids.py`. Lee el histórico y `JUGADOR ids.csv`, consulta ESPN para IDs faltantes y sobrescribe `JUGADOR ids.csv`.
4. Si ejecutaste el paso 3, vuelve a ejecutar `0_diario_espn.py` para generar las estadísticas de la liga con la lista de IDs actualizada.

Durante la temporada, una actualización semanal del histórico suele ser suficiente: `1_hist_descargar.py` → `2_hist_fusionar.py`. Ejecuta el paso 3 solo cuando haga falta sincronizar IDs; no es necesario hacerlo a diario.

> **Atención:** `3_hist_sincronizar_ids.py` reconstruye `JUGADOR ids.csv` a partir de todos los jugadores que aparecen en el histórico, además de los que ya estaban en la lista. Revisa el archivo después de ejecutarlo.

## Estructura del proyecto

```text
nba-hub-app/
├── index.html
├── core.js
├── styles.css
├── README.md
├── assets/
│   ├── fonts/
│   ├── vendor/
│   ├── fantasy-icons/
│   └── team-icons/
├── lang/                         # Traducciones es, eu y en
├── modules/
│   ├── jugadores/
│   ├── entrenadores/
│   └── historico/
└── csv/                          # Datos y herramientas de actualización
```

`assets/` contiene recursos estáticos, `lang/` las traducciones y `modules/` la lógica específica de cada módulo.

### Scripts de datos de la temporada

```text
csv/csv 26-27/
├── 0_diario_espn.py
├── 1_hist_descargar.py
├── 2_hist_fusionar.py
├── 3_hist_sincronizar_ids.py
├── JUGADOR ids.csv
├── ENTRENADOR ids.csv
├── nba_resumen_*.csv
└── nba_fantasy_historico.csv
```