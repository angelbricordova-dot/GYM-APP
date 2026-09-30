# Gym Duo 🏋️💧🪙

App web (PWA) para llevar el progreso de gym de dos personas: entrenos con sobrecarga progresiva,
agua diaria y tokens canjeables por premios. Se instala en el iPhone/Android como una app.

## Estructura

```
netlify.toml          → Netlify publica la carpeta app/
app/
  index.html          → shell de la app + meta tags para iPhone
  manifest.webmanifest→ nombre, iconos, modo "standalone"
  sw.js               → service worker (funciona sin internet)
  styles.css
  js/store.js         → datos y lógica (tokens, sobrecarga, estadísticas)
  js/ui.js            → pantallas
  js/charts.js        → anillos y gráficas
  icons/              → iconos generados
tools/make-icons.mjs  → regenera los iconos: node tools/make-icons.mjs
```

No hay build ni dependencias: son archivos estáticos.

## Probar en local

```bash
cd app && python3 -m http.server 8000   # o: npx http-server app
# abre http://localhost:8000
```

## Publicar en Netlify

1. En Netlify: **Add new site → Import an existing project** y elige este repo de GitHub.
2. Netlify lee `netlify.toml` (publish = `app`, sin comando de build). Dale **Deploy**.
3. Cada `git push` a la rama configurada se publica solo.

## Instalarla como app

- **iPhone (Safari)**: abre la URL → botón **Compartir** → **Agregar a pantalla de inicio**.
  (Tiene que ser Safari; en otros navegadores de iOS no aparece la opción.)
- **Android (Chrome)**: menú ⋮ → **Instalar app**.

## Qué hace la Fase 1

- **Perfiles** (tú y tu novia) con nombre, estatura, peso y meta de días de gym por semana.
- **Entrenos**: fecha, hora, ejercicios y series (kg × reps).
- **Sobrecarga progresiva**: por cada ejercicio te dice la meta del siguiente entreno.
  Doble progresión: si todas tus series con el peso más alto llegaron a 12 reps → sube 2.5 kg y vuelve a 8 reps;
  si no → mismo peso, una rep más. (Rangos en `suggestNext`, `js/store.js`.)
- **Constancia**: anillo semanal, racha de semanas, días y hora en que sueles ir.
- **Agua**: meta diaria (2 L por defecto, editable) con botones rápidos.
- **Tokens y premios**: +10 por ir al gym, +5 por la meta de agua, +5 por récord personal,
  +20 por cumplir la meta semanal. Premios editables (helado, pizza, cine…). Todo son tokens
  de la app, no dinero. Si borras un entreno o bajas el agua, su premio se revierte.

## Importante: limitación de la Fase 1

Los datos se guardan **solo en el teléfono donde los captures** (localStorage). Todavía no se
sincronizan entre tu celular y el de ella, y no hay login. Hay un respaldo (Perfil → Descargar).

## Siguientes fases

1. **Cuentas privadas para ustedes dos + sincronización** (necesita un backend: Supabase o Firebase
   con login, o Netlify Functions + base de datos).
2. **Mensajes motivacionales** entre ustedes y ver el progreso del otro.
3. **Notificaciones** de recordatorio de agua/gym (Web Push funciona en iPhone con la app instalada, iOS 16.4+).
4. Rutinas guardadas, fotos de progreso, medidas corporales.
